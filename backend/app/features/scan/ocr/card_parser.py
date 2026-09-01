"""OCR text lines -> business card fields (company/name/title/department/phone/postal
code/region/address/email/other).

Ported from two prototype pipelines — F:\\1\\business_cards (strong at card detection +
text-cluster cropping) and F:\\1\\card_ocr (strong at field classification) — validated
side by side on the same 16 cards, then merged by taking whichever pipeline did better
at each part.

  - Phone numbers / emails are identified by regex.
  - An address is recognized both by regex and by "2+ consecutive administrative-unit
    suffixes in one line" (e.g. a line like "경기도 성남시 분당구" with no street number is
    still accepted as an address). Address lines aren't limited to a single pick — every
    line that looks like an address is collected and joined in order (it's common for a
    street address, a detail line, and a building name to be split across separate
    lines).
    The leading 5-digit postal code and the 시/도 + 시/군/구 portion are then split out
    into their own fields.
  - Names are judged against Statistics Korea's surname population ranking. Korean names
    are almost always 3 characters (1 for the surname + 2 for the given name), so
    3-character candidates are checked first, only widening to other lengths (2-4) if
    none are found. When multiple candidates tie, the more common surname wins — but if
    there's only one candidate at all, it's accepted regardless of whether its surname is
    on the list, so no foreign/rare surname ever fails to be recognized just because it's
    unlisted.
  - Titles are first matched against a keyword list (suffix matching — "영업이사",
    "마케팅팀장" and other compound titles included; role-like phrases such as
    "AI엔지니어" count too), and if nothing on the card matches a known keyword, whatever
    candidate token remains on the same line as the name is assumed to be the title
    instead.
  - Department is judged only by a small set of unambiguous administrative-unit suffixes
    (팀/센터/본부, etc.) — unlike title keywords, this is a closed set that doesn't keep
    growing, so it's safe to hardcode.
  - Company name defaults to the first candidate line among those not used as name/
    title/department; if the line directly above or below is a short, pure-Hangul word
    that looks like an industry tagline, it's appended (handles a company logo split
    across "company name" + "industry" on two lines).
  - When OCR reads a logo-font word with a stray space between every letter
    (e.g. "모 던 헤 어"), the spaces are collapsed back into the original word.
  - When a short label is glued to the front of a value ("위치 | ...", "E.이메일"), only
    the label gets stripped.
  - Anything that doesn't match a rule is kept entirely in "etc" — so text that was
    recognized but not classified isn't silently lost, and can still be reviewed.
"""
import re

# Some phone numbers use spaces or dots instead of dashes as separators (e.g.
# "T031 123 4567", "02.123.4567") — all three are accepted. Without "." here, a
# dot-separated number is never extracted at all: it doesn't match this regex, so
# take_matches() below leaves it untouched, and if it sits on the same line as an
# address it gets swallowed whole into the address field instead (confirmed on a real
# card: "...4,5층 Tel:02.123.4567~8 Fax:02.123.4569" ended up entirely inside address).
PHONE_RE = re.compile(r"\d{2,3}[-. ]?\d{3,4}[-. ]?\d{4}")
# Marks a line as carrying the mobile number specifically, so it's preferred over an
# office/desk ("Tel"/전화) number when a card lists both — see take_matches's phone_order.
# Matches the full word or the bare single-letter abbreviation cards commonly use
# instead (T/F/M, upper or lower case) — "\bm\b" needs a word boundary on both sides so
# it doesn't fire on the "m" inside an ordinary word.
MOBILE_LABEL_RE = re.compile(r"\bmobile\b|\bm\b|휴대|핸드폰", re.IGNORECASE)
# A fax number must never end up as `phone` (labeled "Mobile" in the UI) — it's not a
# callable number for this app's purposes. Checked against a short window right before
# a phone match (see take_matches) rather than the whole line, since "Tel:xxx Fax:yyy"
# puts both labels on one line.
FAX_LABEL_RE = re.compile(r"\bfax\b|\bf\b|팩스", re.IGNORECASE)
# Once a phone/fax number is cut out of a line by take_matches, its label is left
# behind with nothing anchoring it anymore — along with OCR's "~4" extension-range
# suffix (e.g. "02.123.4567~8"; the digits are already gone by this point, cut out with
# the rest of the number, so only "~4" remains next to the label). If that line is also
# part of the address (a "...4,5층 Tel:02.123.4567~8 Fax:02.123.4569" footer, say), this
# debris rides along into the address field (confirmed on a real card). The trailing
# "~digits" is only matched glued to one of these labels, not standalone, so a real
# floor range like "4~5층" is left untouched. Only the full words are stripped, not the
# single-letter T/F/M abbreviations take_matches recognizes — those are too likely to
# collide with real address content (a building name's initial, etc.) to remove blind.
ADDRESS_DEBRIS_RE = re.compile(r"\b(?:Tel|Fax|Mobile)\b\.?:?~?\d*", re.IGNORECASE)
# OCR sometimes inserts a spurious space around "@" (observed on a real card, anonymized here:
# "hgildong51 @example.co.kr"),
# so the space is allowed here and then stripped back out of the matched value in
# take_matches below to reconstruct a valid email.
EMAIL_RE = re.compile(r"[\w.\-가-힣]+\s*@\s*[\w\-]+\.[\w.\-]+")
LABEL_PREFIX_RE = re.compile(r"^[A-Za-z]\.")  # e.g. "E.이메일", where OCR ran a label into its value with just a period between them
# Handles the case where a label is glued to its value with not even a period between
# them (observed on a real card, anonymized here: "Egildong.hong1234@example.com").
# A real email id conventionally almost
# always starts lowercase, so this is only treated as a label when an uppercase letter
# is immediately followed by a lowercase one (reduces the risk of wrongly truncating
# the rare email id that does start uppercase).
GLUED_LABEL_PREFIX_RE = re.compile(r"^[MTEFW](?=[a-z])")
BARE_MONOGRAM_RE = re.compile(r"^[A-Za-z]{1,3}$")  # detects a logo-initials monogram (e.g. "BL", "NW")
HAS_CONTENT_RE = re.compile(r"[가-힣a-zA-Z0-9]")
# Strips a short label + separator glued to the front of a value (address lines etc,
# e.g. "위치 | 123 ...", "주소: ...", "A.서울특별시..."). Doesn't hardcode the label words
# themselves — judges purely by "short chunk of characters + separator" shape, so any
# label works the same way. "." is included as a separator here (in addition to "|" and
# ":") because dev/generate_cards.py stamps labels in "M./T./E./A." form — email (E.) is
# handled by its own regex (LABEL_PREFIX_RE) separately, while this one is used for
# address (A.), and testing (the dev 30-card set) found "A." was being left in front of
# the address when "." wasn't included here.
LABEL_SEP_PREFIX_RE = re.compile(r"^\s*[^\s|:.]{1,10}\s*[|:.]\s*")

KOREAN_ADDR_UNITS = "시도구군읍면동리로길"
ENGLISH_ADDR_RE = re.compile(r"\b(st\.?|street|ave\.?|avenue|road|rd\.?|city|blvd\.?)\b", re.IGNORECASE)
# A line is accepted as an address, even with no street number, if 2+ words ending in an
# administrative-unit suffix appear consecutively (e.g. a line that's just "경기도 성남시
# 분당구" — 시/도 down to 시/군/구 with nothing more specific).
ADDR_WORD_SUFFIXES = ("특별자치시", "특별자치도", "특별시", "광역시", "도", "시", "군", "구",
                      "읍", "면", "동", "리", "로", "길")

POSTAL_RE = re.compile(r"^(\d{5})\s+")
SIDO_SUFFIXES = ("특별자치시", "특별자치도", "특별시", "광역시", "도")
SIGUNGU_SUFFIXES = ("시", "군", "구")
SIDO_ABBR = {"서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
             "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"}

# Department-name suffixes: unlike title/role names, this is a small, closed set of
# administrative units that doesn't keep growing new entries, so it's safe to hardcode.
# Testing (100 synthetic cards + 16 real cards) found that functional department names
# with no organizational suffix (경영총괄, 마케팅, 고객지원, 자산관리, etc.) were mostly
# falling through to department=None, so the suffixes below were added to cover them.
# Common company-name endings like "부동산" (real estate), or "부" (which attaches to
# almost any word), were excluded — they carry too high a risk of misclassifying a
# company name as a department (e.g. "라라나 부동산" is a company name that would
# otherwise get wrongly tagged as a department).
DEPT_SUFFIXES = ("팀", "센터", "본부", "사업부", "연구소", "지점", "부문", "담당",
                  "실", "관리", "운영", "지원", "기획", "총무", "총괄", "행정", "자문",
                  # Industry-specific department suffixes (added based on a re-review of
                  # the 100-card synthetic set).
                  "영업", "마케팅", "경영", "리서치", "컴플라이언스",
                  "설계", "인테리어", "과", "회계", "로스팅",
                  # "운용"/"시스템" were left out: company names like "센트럴브릿지자산운용"
                  # and "한빛시스템" happen to end in these suffixes, causing a serious
                  # regression where the entire company-name line got misclassified as a
                  # department (confirmed by testing on the card_ocr_final 100-card set
                  # and the dev 30-card set, respectively). English loanwords like
                  # "시스템"/"솔루션"/"테크놀로지" are common in department names but just
                  # as common in Korean IT/tech company names ("OO시스템", "OO솔루션즈"),
                  # so they carry the same risk as "부동산" above.
                  # Legal specialty areas (standalone words with no distinct suffix
                  # pattern, so registered as literal entries).
                  "송무", "형사", "민사", "지식재산권", "조세")

# English department names: startups/design studios/luxury brands often write the role
# entirely in English (e.g. "Engineering", "Atelier"), where the Korean-suffix approach
# doesn't apply at all, so this is judged against a separate closed word list instead.
# Judged by "is this exactly this word" rather than by suffix, because English
# department names are irregular independent nouns with no consistent ending
# ("Design"/"Boutique"/"UX" all look different) — suffix matching would be meaningless
# and would only risk colliding with random fragments of English words. Internal spaces
# are already stripped at the tokenization stage ("Client Relations" ->
# "ClientRelations"), so dictionary entries have their spaces removed the same way.
ENGLISH_DEPT_WORDS = {
    "executive", "engineering", "product", "design", "growth", "data", "people",
    "creative", "art", "brand", "motion", "ux", "copy", "production", "illustration", "studioops",
    "atelier", "craft", "gemology", "clientrelations", "boutique", "bespoke", "workshop", "heritage",
    "marketing", "sales", "finance", "legal", "operations", "support", "research", "strategy",
    "compliance", "security", "ir",
    # 2-letter abbreviations like "hr"/"it"/"pr" were tried without solid grounds and
    # dropped again after they collided with company-logo initials ("HR", "IT", etc.),
    # misclassifying the company name as a department (confirmed by testing: 한빛부동산's
    # "HR" monogram). "ir" is kept since it has real-world grounding (an actual card,
    # 센트럴브릿지's "IR팀장").
}

# Title keywords (suffix matching). Compound expressions with something in front, like
# "영업이사" or "마케팅팀장", can still be judged by their trailing core word (same design
# as the department suffixes above).
TITLE_SUFFIXES = (
    "회장", "부회장", "사장", "부사장", "부대표", "대표이사", "대표",
    "전무이사", "전무", "상무이사", "상무", "이사대우", "이사", "감사", "고문",
    "원장", "부원장", "소장", "부소장",
    "센터장", "지점장", "지사장", "본부장", "국장", "부국장", "실장",
    "팀장", "파트장", "그룹장",
    "부장", "차장", "과장", "대리", "주임", "사원", "인턴",
    "수석연구원", "책임연구원", "선임연구원", "연구원",
    "수석매니저", "책임매니저", "매니저",
    # Not just titles (ranks) — role/function words like "AI엔지니어" show up in the same
    # position next to the name on a card just as often, so they're accepted too.
    "엔지니어", "디자이너", "개발자", "기획자", "마케터", "컨설턴트",
    "코디네이터", "아나운서", "에디터", "프로듀서", "카피라이터",
    # Industry-specific professional titles (law/real estate/cafe) — testing (on
    # synthetic cards) found titles like "대표변호사", "대표공인중개사", "로스팅마스터"
    # were failing to be recognized entirely without these keywords.
    "변호사", "공인중개사", "바리스타", "마스터", "로스터", "그레이더", "건축사",
    "전문위원", "책임자",
)
ENGLISH_TITLE_RE = re.compile(
    r"^(CEO|CTO|CFO|COO|CIO|CMO|CHRO|CPO|VP|PM|PL|PD|MD|"
    r"President|Manager|Director|Engineer|Designer)$", re.IGNORECASE
)
# Multi-word English titles like "Co-Founder & CEO" or "Senior Designer" don't match
# ENGLISH_TITLE_RE above (which requires the whole token to match exactly one word). The
# same approach used for Korean titles (suffix-match the trailing word) is applied to
# English too. Internal spaces are already stripped at the tokenization stage
# ("Co-Founder & CEO" -> "Co-Founder&CEO"), so this lowercases the token and compares
# just the tail.
ENGLISH_TITLE_SUFFIXES = (
    "ceo", "cto", "cfo", "coo", "cio", "cmo", "chro", "cpo",
    "president", "manager", "director", "engineer", "designer", "scientist", "marketer",
    "consultant", "curator", "jeweler", "gemologist", "producer", "illustrator",
    "copywriter", "founder", "lead", "product", "architect",
)

# Surname population ranking from Statistics Korea (2015 Population and Housing Census),
# ordered by frequency (a lower rank value = more common). Only used as a tiebreaker hint
# when multiple candidates overlap; if there's only one candidate, it's accepted
# regardless of the list, so a foreign/rare surname never "fails to recognize" just for
# being unlisted.
TOP_SURNAMES = [
    "김", "이", "박", "최", "정", "강", "조", "윤", "장", "임",
    "한", "오", "서", "신", "권", "황", "안", "송", "전", "홍",
    "유", "고", "문", "양", "손", "배", "백", "허", "남", "심",
    "노", "하", "곽", "성", "차", "주", "우", "구", "나", "민",
    "진", "지", "엄", "채", "원", "천", "방", "공", "현", "함",
    "변", "염", "여", "추", "도", "소", "석", "선", "설", "마",
    "길", "연", "위", "표", "라", "류", "반", "옥", "육",
]
SURNAME_RANK = {s: i for i, s in enumerate(TOP_SURNAMES)}

COMPOUND_SURNAMES = ["남궁", "황보", "제갈", "선우", "사공", "서문", "독고", "동방"]
_COMPOUND_RANK_BASE = len(TOP_SURNAMES)
COMPOUND_SURNAME_RANK = {s: _COMPOUND_RANK_BASE + i for i, s in enumerate(COMPOUND_SURNAMES)}

# OCR sometimes misreads "·" (middle dot) as "." or "•", inconsistently with or without
# surrounding spaces (observed on English-title cards: "Co-Founder & CTO.Engineering",
# "Head of Product .Product"), so "." and "•" are added as separators too. Phone/email/
# address are already extracted before this stage, so there's no risk of confusing this
# with the period in a domain like "kt.com" — those substrings are already gone from
# `remaining` by this point.
SEPARATOR_RE = re.compile(r"[|:/·,.•]")

FIELD_KEYS = ["company", "name", "title", "department",
              "phone", "address", "postal_code", "region", "email"]


def collapse_spaced_hangul(text):
    """When OCR reads a logo-font word with a stray space between every letter
    (e.g. "모 던 헤 어"), collapses the spaces back into the original word. Only applies
    when every space-separated chunk is a single Hangul character, so normally
    space-separated multi-word text ("이사 손민") is never wrongly merged."""
    parts = text.split(" ")
    if len(parts) >= 2 and all(re.fullmatch(r"[가-힣]", p) for p in parts if p):
        return "".join(parts)
    return text


def strip_label_prefix(text):
    """"위치 | 123 Anywhere St." -> "123 Anywhere St.": strips a short label and separator
    (|, :) glued to the front of a value. Doesn't hardcode label words, so it works the
    same regardless of which label appears ("위치", "주소", "Address", etc.) — judged
    purely by shape."""
    return LABEL_SEP_PREFIX_RE.sub("", text, count=1).strip()


def is_simple_label_line(line):
    """Whether a line is a short, pure-Hangul word — the shape of an industry tagline
    next to a company name."""
    return bool(re.fullmatch(r"[가-힣]{2,10}", line))


def is_address_line(line, other_line_has_full_address=False, near_role_line=False):
    # If a fragment looks like a title/department, rule out "address" first. Testing
    # (on synthetic cards) found that a logo-font word can coincidentally contain an
    # address-suffix character (e.g. the "로" in "프로젝트") plus a department number
    # with a digit in it, which would otherwise trip the has_unit+has_digit check below
    # and get the whole thing wrongly classified as an address. But some cases have
    # strong address evidence elsewhere (e.g. "KT우면연구센터", a building name that
    # happens to collide with the department suffix "센터" — confirmed by testing where a
    # real address was getting dropped entirely), so this exception doesn't apply when
    # there's already solid address evidence (an administrative-unit character plus a
    # digit together in the same fragment).
    segs = [s.strip().replace(" ", "") for s in SEPARATOR_RE.split(line) if s.strip()]
    strong_addr_evidence = any(
        any(u in s for u in KOREAN_ADDR_UNITS) and any(c.isdigit() for c in s) for s in segs
    )
    if not strong_addr_evidence and any(is_department_token(s) or is_title_token(s) for s in segs):
        return False

    has_unit = any(u in line for u in KOREAN_ADDR_UNITS)
    has_digit = any(c.isdigit() for c in line)
    if (has_unit and has_digit) or ENGLISH_ADDR_RE.search(line):
        return True
    # OCR sometimes appends stray punctuation after a region name (e.g. "서울특별시'"), so
    # trailing characters that aren't Hangul or digits are stripped before judging.
    stripped = re.sub(r"[^가-힣0-9]+$", "", line.strip())
    # OCR sometimes splits an address across three lines like "서울특별시" / "마포구" /
    # "어울마당로 100,2층(서교동)" (confirmed by testing on synthetic cards). Only the last
    # line, which has the street number, gets caught as an address, and the preceding
    # 시/도 · 시/군/구 lines can't satisfy the "2+ consecutive" rule below on their own and
    # get dropped. If a whole line is nothing but a 시/도 name or a 시/군/구 name (nothing
    # else could be mixed in, so it's safe), it's accepted as an address too.
    if stripped.endswith(SIDO_SUFFIXES) or stripped in SIDO_ABBR:
        return True
    # A bare token ending in 시/군/구 is ambiguous with a Korean full name that happens
    # to end the same way (e.g. "홍길구" — the shape of the real card name behind this
    # regression, confirmed to get
    # swallowed into the address and lost entirely as a result, since address lines are
    # removed from `remaining` before name candidates are even collected). Deferring to
    # a name candidate is restricted to when either (a) another line already has a
    # *complete* address (unit + digit together, e.g. a street number) — a genuine split
    # address (the pattern this whole branch exists for, see the comment above) never
    # has a real street-numbered line AND a redundant bare region name both on the card,
    # so a bare region-shaped line alongside an already-complete address is far more
    # likely to be a coincidental name — or (b) the line sits directly next to a
    # title/department line, the layout position a person's own name actually appears in
    # on a card. (b) matters because (a) alone still loses the name whenever the OCR
    # pass on that particular photo fails to capture the street-number digits on a
    # single line (a split/partial read, not a card layout issue) — confirmed by
    # reproducing this with the exact real card behind the original regression, just
    # with its address line broken across two OCR reads instead of one. Without
    # requiring at least one of (a)/(b), a real place name that happens to start with a
    # common surname character (마포구's "마", 김포시's "김", ...) would be wrongly
    # excluded too — confirmed by testing: a card with only "마포구" on its own
    # regressed.
    if (
        2 <= len(stripped) <= 6
        and stripped.endswith(SIGUNGU_SUFFIXES)
        and re.fullmatch(r"[가-힣]+", stripped)
        and not (
            (other_line_has_full_address or near_role_line)
            and is_name_candidate_token(stripped)
            and surname_rank(stripped) is not None
        )
    ):
        return True
    # The exception for a line with no street number but 2+ consecutive
    # administrative-unit suffixes (e.g. "경기도 성남시 분당구"). Since single-character
    # suffixes like "리"/"로"/"동" can coincidentally match the end of an ordinary word
    # that's actually a department suffix (DEPT_SUFFIXES) — e.g. "계약관리"·"운영관리" —
    # words ending in a department suffix are excluded from address-candidate words
    # (confirmed by testing: "계약관리 주임·계약관리" was being misclassified as an
    # address).
    unit_words = [w for w in line.split()
                  if len(w) >= 2 and w.endswith(ADDR_WORD_SUFFIXES) and not w.endswith(DEPT_SUFFIXES)]
    return len(unit_words) >= 2


# Contact-info label words that are pure Hangul and 2-4 characters — the exact same
# shape is_name_candidate_token accepts. Normally these get consumed as part of a
# phone/email match and disappear, but when a label sits on its own line or survives as
# a take_matches() leftover (e.g. a line reading just "직통번호:070.1234.5678" once the
# phone number is cut out), the bare label word is left behind and — with nothing else
# to rule it out — can get wrongly picked as the name (confirmed on a real card: "직통
# 번호" ended up as the saved contact's name). English labels ("Tel", "Mobile", ...)
# don't need this: is_name_candidate_token already requires pure Hangul.
CONTACT_LABEL_WORDS = {
    "전화", "전화번호", "직통", "직통번호", "내선", "내선번호",
    "휴대폰", "휴대전화", "이동전화", "핸드폰",
    "팩스", "팩스번호", "이메일", "메일", "홈페이지", "웹사이트", "주소",
}


def is_name_candidate_token(tok):
    if tok in CONTACT_LABEL_WORDS:
        return False
    return bool(re.fullmatch(r"[가-힣]+", tok)) and 2 <= len(tok) <= 4


def is_department_token(tok):
    if 2 <= len(tok) <= 30 and tok.endswith(DEPT_SUFFIXES):
        return True
    return tok.replace(" ", "").lower() in ENGLISH_DEPT_WORDS


PAREN_SUFFIX_RE = re.compile(r"\([^()]*\)$")  # a parenthetical note appended to the end, e.g. "최고투자책임자(CIO)"


def is_title_token(tok):
    # If a parenthetical note is appended to the end (e.g. "전문위원(세무)",
    # "최고투자책임자(CIO)"), the suffix is judged on the token with the parens stripped.
    # The stored value is still the original tok (callers use tok as-is), so this only
    # loosens the judging criteria — it doesn't change the value.
    core = PAREN_SUFFIX_RE.sub("", tok)
    if 2 <= len(core) <= 20 and core.endswith(TITLE_SUFFIXES):
        return True
    if ENGLISH_TITLE_RE.fullmatch(tok):
        return True
    return core.replace(" ", "").lower().endswith(ENGLISH_TITLE_SUFFIXES)


def split_glued_title_name(tok):
    """When OCR reads a title and a name glued together with no space at all (e.g.
    "이사손민", "대표전해원", "공인중개사김라라"), and the front part matches a known title
    keyword, splits it into (title, name candidate). Returns None if no match is found.
    Checked longest keyword first, so a shorter keyword that happens to overlap the front
    part doesn't cause a wrong split point."""
    if not re.fullmatch(r"[가-힣]{4,10}", tok):
        return None
    for suf in sorted(TITLE_SUFFIXES, key=len, reverse=True):
        if tok.startswith(suf):
            rest = tok[len(suf):]
            if is_name_candidate_token(rest):
                return suf, rest
    return None


def surname_rank(tok):
    """Returns the surname priority (lower = more common) of a name-candidate token, or
    None if it's not on the list."""
    if tok[:2] in COMPOUND_SURNAME_RANK:
        return COMPOUND_SURNAME_RANK[tok[:2]]
    if tok[0] in SURNAME_RANK:
        return SURNAME_RANK[tok[0]]
    return None


def split_address(address):
    """Address text -> (postal code, region). Returns None if it doesn't match the
    pattern."""
    if not address:
        return None, None
    text = address.strip()

    postal = None
    m = POSTAL_RE.match(text)
    if m:
        postal = m.group(1)
        text = text[m.end():].strip()

    tokens = text.split()
    region_parts = []
    i = 0
    if tokens and (tokens[0].endswith(SIDO_SUFFIXES) or tokens[0] in SIDO_ABBR):
        region_parts.append(tokens[0])
        i = 1
    if i < len(tokens) and tokens[i].endswith(SIGUNGU_SUFFIXES) and len(tokens[i]) >= 2:
        region_parts.append(tokens[i])
        i += 1

    region = " ".join(region_parts) if region_parts else None
    return postal, region


def parse_fields(lines):
    """OCR text lines -> (fields dict, etc list) tuple."""
    # Drop lines with no letters/digits at all (a misread icon symbol, etc.) up front.
    # Logo-font lines with letter-spacing get normalized here too, once, so every field
    # check downstream works against the same normalized text.
    remaining = [collapse_spaced_hangul(l) for l in lines if HAS_CONTENT_RE.search(l)]
    result = {key: None for key in FIELD_KEYS}
    etc = []

    def take_matches(pattern, key, label, order=None):
        # Only cuts the matched portion out of a line, leaving any other information on
        # that same line in `remaining`. This used to delete the whole line on a match,
        # which broke cards where a phone number and an email were on the same line
        # (observed: law/luxury templates), since extracting the email first would take
        # the phone number down with it.
        #
        # Loops per line (not just one search) so a line with two matches — e.g. a
        # footer like "... Tel:02.123.4567 Fax:02.123.4569" — gets both cut out instead
        # of leaving the second one glued to whatever's left (confirmed on a real card:
        # the un-extracted fax number kept that whole line looking like an address,
        # dragging the fax digits into the address field alongside it).
        for original_line in list(order) if order is not None else list(remaining):
            current = original_line
            while current in remaining:
                idx = remaining.index(current)
                m = pattern.search(current)
                if not m:
                    break
                value = m.group(0)
                if key == "email":
                    value = re.sub(r"\s+", "", value)
                    value = LABEL_PREFIX_RE.sub("", value)
                    value = GLUED_LABEL_PREFIX_RE.sub("", value)
                # A fax number must never become `phone` — checked against the text
                # right before this specific match (not the whole line), since a line
                # can carry both a Tel and a Fax label ("Tel:xxx Fax:yyy").
                is_fax = key == "phone" and FAX_LABEL_RE.search(current[max(0, m.start() - 15) : m.start()])
                if result[key] is None and not is_fax:
                    result[key] = value
                else:
                    etc.append(f"{label}:{value}")
                rest = (current[:m.start()] + current[m.end():]).strip()
                # If only a single label character is left over (e.g. "M 010-..." ->
                # "M"), drop it. Leaving a 1-character leftover like that around made it
                # indistinguishable from an actual short company name (e.g. "kt") — both
                # hit the same logo-monogram check — so a label leftover that just
                # happened to come first would get wrongly picked as the company name.
                if rest and len(rest) >= 2 and HAS_CONTENT_RE.search(rest):
                    remaining[idx] = rest
                    current = rest
                else:
                    remaining.pop(idx)
                    break

    take_matches(EMAIL_RE, "email", "이메일")
    # A card with both a desk/office number and a mobile number should save the mobile
    # one as `phone` — that's the one actually worth having for a business-networking
    # app — but take_matches() otherwise just takes whichever line comes first in
    # reading order, which is commonly the office Tel line (confirmed on a real card:
    # the office number ended up as "phone"/"Mobile" while the actual
    # "Mobile:010.xxxx.xxxx" line's number was discarded to `etc`). Only reorders the
    # snapshot handed to take_matches, not `remaining` itself — company/title/name
    # selection further down still depends on the card's real reading order.
    phone_order = sorted(remaining, key=lambda line: 0 if MOBILE_LABEL_RE.search(line) else 1)
    take_matches(PHONE_RE, "phone", "전화", order=phone_order)

    # In case an address is split across multiple lines, every line that looks like an
    # address is collected (not just the first one) and joined in order.
    other_line_has_full_address = any(
        any(u in line for u in KOREAN_ADDR_UNITS) and any(c.isdigit() for c in line)
        for line in remaining
    )
    # A cheap, line-level department/title check (not the full tokenization
    # parse_fields does further down for dept_lines/title_lines) run early enough to
    # inform is_address_line's name/district disambiguation above, before address lines
    # get removed from `remaining`.
    role_line_positions = {
        i
        for i, line in enumerate(remaining)
        if any(
            is_department_token(seg) or is_title_token(seg)
            for seg in (s.strip().replace(" ", "") for s in SEPARATOR_RE.split(line))
            if seg
        )
    }
    address_parts = []
    for idx, line in enumerate(list(remaining)):
        near_role_line = (idx - 1) in role_line_positions or (idx + 1) in role_line_positions
        if is_address_line(line, other_line_has_full_address, near_role_line):
            address_parts.append(strip_label_prefix(line.strip()))
            remaining.remove(line)
    if address_parts:
        cleaned = ADDRESS_DEBRIS_RE.sub("", " ".join(address_parts))
        result["address"] = re.sub(r"\s+", " ", cleaned).strip()

    # Classify tokens line by line: a department suffix -> confirmed immediately, a
    # title keyword -> confirmed immediately, anything else that's 2-4 Hangul characters
    # is held as a name candidate (not discarded yet, since this same line might later
    # get picked as the company name instead).
    line_candidates = []
    line_leftovers = []
    dept_lines = set()
    title_lines = set()
    for idx, line in enumerate(remaining):
        seg_tokens = [t.strip() for t in SEPARATOR_RE.split(line) if t.strip()]
        # Some lines are split only by whitespace with no punctuation separator (e.g.
        # "이사 손민"), and some have a spurious space OCR inserted mid-word (e.g. "이
        # 연희") — these two cases are told apart by judging each whitespace-split piece
        # of a segment individually, so a mix of real separators and spurious spaces in
        # the same line doesn't interfere with each other.
        tokens = []
        for seg in seg_tokens:
            parts = [p for p in seg.split(" ") if p]
            # Only split a segment into its parts when one of them is confidently
            # recognized as a title/department keyword (e.g. "이사 손민"). Without this
            # condition, a company name that happens to be two 2-4-character Hangul
            # words ("스튜디오 오르빗") would get split the same way, and the second word
            # ("오르빗") would look like a surname and wrongly get picked as the name
            # candidate ahead of the real name (confirmed by testing on synthetic
            # cards). Since a company name never contains a title/department keyword,
            # restricting the split to "one of the parts is confidently a title/
            # department" keeps the normal "이사 손민" case working while preventing this
            # company-name misclassification.
            part_is_role = [is_department_token(p) or is_title_token(p) for p in parts]
            has_role_word = any(part_is_role)
            if len(parts) >= 2 and has_role_word and all(part_is_role):
                # Compound expressions like "재무팀 과장" or "바리스타 팀장" — two
                # title/department keywords back to back — need to be joined into one
                # so the whole thing ("재무팀 과장") ends up intact as the title.
                # Splitting them apart instead makes "재무팀" match the department suffix
                # ("팀") and get classified as department, while "과장" gets classified as
                # title on its own — leaving only the truncated "과장" in title, which
                # testing confirmed actually happens.
                tokens.append(seg.replace(" ", ""))
            elif has_role_word and sum(is_name_candidate_token(p) for p in parts) >= 2:
                tokens.extend(parts)
            else:
                tokens.append(seg.replace(" ", ""))

        cands, leftovers = [], []
        for tok in tokens:
            if is_department_token(tok):
                if result["department"] is None:
                    result["department"] = tok
                else:
                    etc.append(f"직무:{tok}")
                dept_lines.add(idx)
            elif is_title_token(tok):
                if result["title"] is None:
                    result["title"] = tok
                else:
                    etc.append(f"직급:{tok}")
                title_lines.add(idx)
            else:
                # split_glued_title_name is checked before is_name_candidate_token.
                # "이사손민" (4 characters) already falls within is_name_candidate_token's
                # own range (2-4), so checking that first would swallow it whole as a
                # name candidate before this split logic ever gets a chance to run
                # (confirmed by testing — split_glued_title_name was only ever firing on
                # tokens of 5+ characters).
                glued = split_glued_title_name(tok)
                if glued:
                    title_part, name_part = glued
                    if result["title"] is None:
                        result["title"] = title_part
                    else:
                        etc.append(f"직급:{title_part}")
                    title_lines.add(idx)
                    cands.append(name_part)
                elif is_name_candidate_token(tok):
                    cands.append(tok)
                elif tok:
                    leftovers.append(tok)
        line_candidates.append(cands)
        line_leftovers.append(leftovers)

    entries = [(i, tok) for i, cands in enumerate(line_candidates) for tok in cands]

    # Name: picks the highest-priority candidate by surname commonness. Korean names
    # are almost always 3 characters (surname + 2-character given name), so 3-character
    # candidates are checked first, only widening to other lengths (2-4) if none are
    # found -> this reduces cases where a short Hangul word that happens to be in the
    # background gets wrongly picked just because its first character is a more common
    # surname than the real name's. If no candidate is on the surname list at all, the
    # first candidate in reading order is accepted as-is.
    def best_ranked(length_filter):
        idx, best_rank = None, None
        for k, (_, tok) in enumerate(entries):
            if length_filter is not None and len(tok) != length_filter:
                continue
            rank = surname_rank(tok)
            if rank is not None and (best_rank is None or rank < best_rank):
                best_rank, idx = rank, k
        return idx

    name_idx = best_ranked(3)
    if name_idx is None:
        name_idx = best_ranked(None)
    if name_idx is None and entries:
        name_idx = 0

    used_lines = set()
    name_line = None
    if name_idx is not None:
        name_line, name_tok = entries[name_idx]
        result["name"] = name_tok
        used_lines.add(name_line)

    # If no title keyword was found on the card (an uncommon phrasing), the remaining
    # candidate on the same line as the name is assumed to be the title first (a label
    # commonly sits right next to the name), falling back to the name's own line or a
    # line below it if that doesn't work either. Lines above the name are excluded (they
    # tend to be the company/logo area — e.g. a short company name like "아르장" can get
    # mistaken for a name candidate — and using one as a fallback here would steal the
    # company name), since it's safer to leave the title blank than to steal the company
    # name.
    title_idx = None
    if result["title"] is None:
        for k, (i, tok) in enumerate(entries):
            if k != name_idx and i == name_line:
                title_idx = k
                break
        if title_idx is None:
            for k, (i, tok) in enumerate(entries):
                if k == name_idx:
                    continue
                if name_line is not None and i < name_line:
                    continue
                title_idx = k
                break
        if title_idx is not None:
            result["title"] = entries[title_idx][1]
            used_lines.add(entries[title_idx][0])

    # Company: defaults to the first line in reading order among those not used as
    # name/title/department, but a line that's nothing but a logo-initials monogram
    # (e.g. a 1-3-character uppercase monogram like "BL", "NW") is deferred if another
    # candidate exists, since it carries almost no information. If the line directly
    # above/below is a short, pure-Hangul word that looks like an industry tagline, it's
    # appended too (handles a company logo split across "company name" + "industry" on
    # two lines). Only pure-Hangul lines are eligible to merge in, so unrelated leftovers
    # like a URL or phone-number fragment don't get dragged along.
    #
    # An earlier version prioritized "the line with zero name-candidate tokens", but
    # testing (on synthetic cards) found two cases where that pushed out the real
    # company name:
    #   - A company name in two Hangul words (e.g. "주식회사 블루라인", each word 2-4
    #     characters) had both words wrongly treated as "name candidates" and excluded,
    #     so the logo-initials monogram "BL" got picked as the company name instead.
    #   - A company name that's itself a short 2-4-character Hangul word (e.g. "아르장")
    #     got wrongly treated as a "name candidate" and excluded, so the English tagline
    #     "ARGENT ATELIER" got picked as the company name instead.
    # A short company name like "KT" is fine as-is, as long as there's no other
    # competing candidate line.
    candidate_lines = used_lines | dept_lines | title_lines
    uncl = [i for i in range(len(remaining)) if i not in candidate_lines]
    company_lines = []
    if uncl:
        non_monogram = [i for i in uncl if not BARE_MONOGRAM_RE.fullmatch(remaining[i].strip())]
        primary = non_monogram[0] if non_monogram else uncl[0]
        company_lines = [primary]
        for neighbor in (primary - 1, primary + 1):
            if neighbor in uncl and is_simple_label_line(remaining[neighbor].strip()):
                company_lines.append(neighbor)
        company_lines.sort()
    if company_lines:
        result["company"] = " ".join(remaining[i].strip() for i in company_lines)

    for k, (i, tok) in enumerate(entries):
        if k in (name_idx, title_idx) or i in company_lines:
            continue
        etc.append(tok)

    for i, leftovers in enumerate(line_leftovers):
        if i in company_lines:
            continue
        etc.extend(leftovers)

    result["postal_code"], result["region"] = split_address(result["address"])

    return result, etc
