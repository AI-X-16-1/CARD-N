"""OCR 텍스트 라인 -> 명함 필드(회사/이름/직급/직무/전화/우편번호/지역/주소/이메일/기타) 파싱.

F:\\1\\business_cards(카드 검출 + 텍스트 군집 크롭 강점)와 F:\\1\\card_ocr(필드 분류 강점) 두
파이프라인을 같은 16장으로 비교 검증한 뒤, 각자 더 잘한 부분을 골라 병합한 버전이다.

  - 핸드폰 번호/이메일은 정규식 패턴으로 식별
  - 주소는 정규식 패턴 + "행정단위 접미사가 2개 이상 연속"인 줄까지 인식하고(예: "경기도 성남시
    분당구"처럼 번지수가 없는 줄도 주소로 인정), 주소로 보이는 줄을 하나만 채택하지 않고 전부 찾아
    순서대로 이어붙인다(도로명주소 + 상세주소 + 건물명이 별도 줄로 나뉘는 경우가 흔하기 때문).
    이어서 앞부분 5자리 우편번호와 시/도+시/군/구를 별도 필드로 분리해낸다.
  - 이름은 통계청 성씨 인구 순위로 판단한다. 한국 이름은 대부분 3자(성1+이름2)라서 3자 후보를
    먼저 찾고, 없을 때만 다른 길이(2~4자)까지 넓힌다. 후보가 여럿이면 흔한 성씨를 우선하되,
    목록에 없는 성씨라도 후보가 하나뿐이면 그대로 채택 -> 외국계/희귀 성씨도 인식 가능
  - 직급은 대표/이사/팀장 등 키워드 목록(접미사 매칭, "AI엔지니어"처럼 직무성 표현도 포함)으로
    먼저 판단하고, 목록에 없는 표현이면 이름과 같은 줄에 남은 후보를 직급으로 추정하는 방식으로 대체
  - 직무(부서)는 팀/센터/본부 등 소수의 명확한 행정단위 접미사로만 판단(직급 키워드와 달리
    새 단어가 계속 생기지 않는 닫힌 집합이라 안전하게 고정 사용 가능)
  - 회사명은 이름/직급/직무로 쓰이지 않은 줄 중 첫 후보를 기본으로 하고, 바로 위/아래 줄이
    업종/부제처럼 순수 한글 단어로만 된 짧은 줄이면 함께 붙인다(로고 문구가 "회사명"+"업종"
    두 줄로 나뉘는 경우 대응)
  - OCR이 로고체 글자를 한 글자씩 띄어 읽은 경우("모 던 헤 어") 공백을 제거해 원래 단어로 합친다
  - 값 앞에 짧은 라벨이 붙은 경우("위치 | ...", "E.이메일") 라벨만 제거한다
  - 규칙에 안 걸리는 텍스트는 전부 '기타'로 보존 -> 인식은 됐지만 분류 못한 정보가 사라지지 않고 검토 가능
"""
import re

# 대시 대신 공백으로만 구분된 전화번호도 있어("T032 553 0714") 대시/공백 둘 다 허용한다.
PHONE_RE = re.compile(r"\d{2,3}[- ]?\d{3,4}[- ]?\d{4}")
# "@" 앞뒤에 OCR이 스퓨리어스 공백을 끼워넣는 경우가 있어(실측: "shwang51 @raonclinic.co.kr")
# 공백을 허용하되, 매칭된 값에서는 아래 take_matches에서 공백을 다시 제거해 정상 이메일로 합친다.
EMAIL_RE = re.compile(r"[\w.\-가-힣]+\s*@\s*[\w\-]+\.[\w.\-]+")
LABEL_PREFIX_RE = re.compile(r"^[A-Za-z]\.")  # "E.이메일"처럼 OCR이 라벨과 값을 붙여 읽은 경우 제거
# "E이메일"처럼 라벨과 값 사이에 마침표조차 없이 완전히 붙어버린 경우(실측:
# "Eminjun.shin1201@kt.com"). 실제 이메일 아이디는 관례상 소문자로 시작하는 경우가 거의
# 전부라, 대문자 라벨 글자(M/T/E/F/W) 바로 뒤에 소문자가 이어질 때만 라벨로 보고 제거한다
# (이메일 아이디 자체가 대문자로 시작하는 드문 경우까지 잘못 잘라내는 위험을 줄이기 위함).
GLUED_LABEL_PREFIX_RE = re.compile(r"^[MTEFW](?=[a-z])")
BARE_MONOGRAM_RE = re.compile(r"^[A-Za-z]{1,3}$")  # 로고 이니셜("BL", "NW" 등) 판별용
HAS_CONTENT_RE = re.compile(r"[가-힣a-zA-Z0-9]")
# 주소 등 값 앞에 짧은 라벨과 구분자가 붙어 있으면 제거("위치 | 123 ...", "주소: ...",
# "A.서울특별시..."). 라벨 단어 자체를 사전에 등록하지 않고 "짧은 글자 뭉치 + 구분자" 형태만으로
# 판단한다. 구분자에 "."도 포함하는 이유: dev/generate_cards.py가 M./T./E./A. 형식으로 라벨을
# 찍는데, 이메일(E.)만 별도 정규식(LABEL_PREFIX_RE)으로 처리하고 주소(A.)는 |나 : 만 인식하는
# 이 정규식 대상이라 "."이 빠져 있어 주소 앞에 "A."가 그대로 남는 문제가 실측(dev 30장 세트)으로
# 확인됐다.
LABEL_SEP_PREFIX_RE = re.compile(r"^\s*[^\s|:.]{1,10}\s*[|:.]\s*")

KOREAN_ADDR_UNITS = "시도구군읍면동리로길"
ENGLISH_ADDR_RE = re.compile(r"\b(st\.?|street|ave\.?|avenue|road|rd\.?|city|blvd\.?)\b", re.I)
# 행정단위 접미사로 끝나는 단어가 한 줄에 2개 이상 연속으로 나오면 번지수가 없어도 주소로 판단한다
# (예: "경기도 성남시 분당구"처럼 시/군/구까지만 적힌 줄 대응).
ADDR_WORD_SUFFIXES = ("특별자치시", "특별자치도", "특별시", "광역시", "도", "시", "군", "구",
                      "읍", "면", "동", "리", "로", "길")

POSTAL_RE = re.compile(r"^(\d{5})\s+")
SIDO_SUFFIXES = ("특별자치시", "특별자치도", "특별시", "광역시", "도")
SIGUNGU_SUFFIXES = ("시", "군", "구")
SIDO_ABBR = {"서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종",
             "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"}

# 부서명 접미사: 새 직급/직책명과 달리 계속 새로 생기지 않는 소수의 행정단위라 안전하게 고정 사용 가능.
# 실측(합성 명함 100장 + 실제 16장) 결과 "팀/센터/본부/..."류 조직단위 접미사가 없는 기능형
# 부서명(경영총괄, 마케팅, 고객지원, 자산관리 등)이 대부분 department=None으로 빠지는 게 확인되어
# 아래 접미사들을 추가했다. 회사명 끝에 흔히 붙는 "부동산", 아무 단어에나 붙는 "부" 같은 접미사는
# 회사명을 부서로 오분류할 위험이 커서 제외했다(예: "라라나 부동산"이 회사명인데 부서로 잘못 잡힘).
DEPT_SUFFIXES = ("팀", "센터", "본부", "사업부", "연구소", "지점", "부문", "담당",
                  "실", "관리", "운영", "지원", "기획", "총무", "총괄", "행정", "자문",
                  # 업종별 부서 접미사(실측: 합성 명함 100장 재검토 결과 추가 근거 확보).
                  # "과"(내과/외과/피부과 등 의료 진료과)는 "결과"/"효과"처럼 부서와 무관한
                  # 일반 단어와도 겹칠 수 있지만, 명함의 이 자리(직급/직무 후보 판정)에는
                  # 그런 일반 단어가 나타날 일이 거의 없어 위험이 낮다고 보고 포함했다.
                  "영업", "마케팅", "경영", "리서치", "컴플라이언스",
                  "설계", "인테리어", "과", "회계", "로스팅",
                  # "운용"/"시스템"은 뺐다: 회사명 "센트럴브릿지자산운용"·"한빛시스템"이 하필 이
                  # 접미사로 끝나서 회사 줄 전체가 부서로 오분류되는 심각한 회귀가 실측(각각
                  # card_ocr_final 100장, dev 30장 세트)으로 확인됐다. "시스템"/"솔루션"/
                  # "테크놀로지"류 영어 차용어는 부서명뿐 아니라 한국 IT/기술 회사명에도 흔히
                  # 쓰여서("OO시스템", "OO솔루션즈") "부동산"과 같은 이유로 위험하다.
                  # 법률 전문 분야(특정 접미사 패턴이 없는 독립 단어라 그대로 등록)
                  "송무", "형사", "민사", "지식재산권", "조세")

# 영문 부서명: 스타트업/디자인스튜디오/럭셔리 브랜드 명함처럼 직무를 통째로 영어로 쓰는 경우
# 한글 접미사 방식이 아예 안 통해서(예: "Engineering", "Atelier") 별도의 닫힌 단어 목록으로 판단한다.
# 접미사가 아니라 "정확히 이 단어인가"로 판단하는 이유: 영어 부서명은 한국어와 달리 규칙적인
# 끝맺음 형태가 없는 독립 명사라("Design"/"Boutique"/"UX"처럼 형태가 제각각), 접미사 매칭은
# 의미가 없고 오히려 임의의 영단어 일부와 우연히 겹칠 위험만 커진다. 토큰화 단계에서 내부 공백은
# 이미 제거되므로("Client Relations" -> "ClientRelations") 사전 항목도 같은 규칙으로 공백을 뺐다.
ENGLISH_DEPT_WORDS = {
    "executive", "engineering", "product", "design", "growth", "data", "people",
    "creative", "art", "brand", "motion", "ux", "copy", "production", "illustration", "studioops",
    "atelier", "craft", "gemology", "clientrelations", "boutique", "bespoke", "workshop", "heritage",
    "marketing", "sales", "finance", "legal", "operations", "support", "research", "strategy",
    "compliance", "security", "ir",
    # "hr"/"it"/"pr" 같은 2자 약어는 근거 없이 추가했다가 회사 로고 이니셜("HR", "IT" 등)과
    # 충돌해 회사명이 부서로 잘못 인식되는 문제가 실측(한빛부동산 "HR" 모노그램)으로 확인되어 뺐다.
    # "ir"는 실제 명함(센트럴브릿지 "IR팀장")에서 확인된 근거가 있어 유지한다.
}

# 직급 키워드(접미사 매칭). "영업이사", "마케팅팀장"처럼 앞에 다른 말이 붙는 복합 표현도
# 뒤쪽 핵심 단어로 판단할 수 있도록 접미사 방식을 사용(직무 접미사와 동일한 설계).
TITLE_SUFFIXES = (
    "회장", "부회장", "사장", "부사장", "부대표", "대표이사", "대표",
    "전무이사", "전무", "상무이사", "상무", "이사대우", "이사", "감사", "고문",
    "원장", "부원장", "소장", "부소장",
    "센터장", "지점장", "지사장", "본부장", "국장", "부국장", "실장",
    "팀장", "파트장", "그룹장",
    "부장", "차장", "과장", "대리", "주임", "사원", "인턴",
    "수석연구원", "책임연구원", "선임연구원", "연구원",
    "수석매니저", "책임매니저", "매니저",
    # 직급(계급)뿐 아니라 "AI엔지니어"처럼 직무/역할을 나타내는 표현도 명함에서
    # 같은 자리(이름 옆)에 자주 쓰여서 함께 인정한다.
    "엔지니어", "디자이너", "개발자", "기획자", "마케터", "컨설턴트",
    "코디네이터", "아나운서", "에디터", "프로듀서", "카피라이터",
    # 업종별 전문직 명칭(법률/부동산/카페) — 실측(합성 명함) 결과 이 키워드들이 없어서
    # "대표변호사", "대표공인중개사", "로스팅마스터" 같은 직급이 통째로 인식 실패했다.
    "변호사", "공인중개사", "바리스타", "마스터", "로스터", "그레이더", "건축사",
    "전문위원", "책임자",
)
ENGLISH_TITLE_RE = re.compile(
    r"^(CEO|CTO|CFO|COO|CIO|CMO|CHRO|CPO|VP|PM|PL|PD|MD|"
    r"President|Manager|Director|Engineer|Designer)$", re.I
)
# "Co-Founder & CEO", "Senior Designer"처럼 여러 단어로 된 영문 직급은 위 ENGLISH_TITLE_RE
# (전체가 정확히 한 단어여야 함)에 안 걸린다. 한글 직급과 같은 방식(끝 단어로 접미사 매칭)을
# 영어에도 적용한다. 토큰화 단계에서 내부 공백이 제거되므로("Co-Founder & CEO" ->
# "Co-Founder&CEO") 소문자로 바꾼 뒤 끝부분만 비교한다.
ENGLISH_TITLE_SUFFIXES = (
    "ceo", "cto", "cfo", "coo", "cio", "cmo", "chro", "cpo",
    "president", "manager", "director", "engineer", "designer", "scientist", "marketer",
    "consultant", "curator", "jeweler", "gemologist", "producer", "illustrator",
    "copywriter", "founder", "lead", "product", "architect",
)

# 통계청 성씨 인구 통계(2015 인구주택총조사) 상위권 기준, 흔한 성씨일수록 앞쪽(순위 값이 낮을수록 우선).
# 후보가 여럿 겹칠 때만 참고하는 힌트이며, 후보가 하나뿐이면 목록과 무관하게 그대로 채택되므로
# 외국계/희귀 성씨라서 "인식 실패"하는 경우는 없다.
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

# "·"(가운뎃점)를 OCR이 "."나 "•"로, 그것도 앞뒤 공백 유무가 제각각으로 잘못 읽는 경우가
# 실측(영문 직무 카드: "Co-Founder & CTO.Engineering", "Head of Product .Product" 등)에서
# 여럿 확인되어 "."와 "•"도 구분자로 추가했다. 이메일/전화/주소는 이 단계 전에 이미 별도
# 추출되어 remaining에서 빠진 뒤라 "kt.com" 같은 도메인의 마침표와 헷갈릴 일이 없다.
SEPARATOR_RE = re.compile(r"[|:/·,.•]")

FIELD_KEYS = ["company", "name", "title", "department",
              "phone", "address", "postal_code", "region", "email"]


def collapse_spaced_hangul(text):
    """OCR이 로고체 글자를 한 글자씩 띄어서 읽은 경우("모 던 헤 어") 공백을 제거해 원래
    단어로 합친다. 정상적으로 띄어쓰기된 여러 단어("이사 손민")까지 잘못 합치지 않도록,
    공백으로 나뉜 조각이 전부 한글 1글자일 때만 적용한다."""
    parts = text.split(" ")
    if len(parts) >= 2 and all(re.fullmatch(r"[가-힣]", p) for p in parts if p):
        return "".join(parts)
    return text


def strip_label_prefix(text):
    """"위치 | 123 Anywhere St." -> "123 Anywhere St."처럼, 값 앞에 붙은 짧은 라벨과
    구분자(|, :)를 제거한다. 라벨 단어를 사전에 등록하지 않고 형태만으로 판단하므로
    "위치", "주소", "Address" 등 어떤 라벨이 와도 동일하게 동작한다."""
    return LABEL_SEP_PREFIX_RE.sub("", text, count=1).strip()


def is_simple_label_line(line):
    """회사명 옆에 붙은 업종/부제처럼 순수 한글 단어로만 된 짧은 줄인지 판단한다."""
    return bool(re.fullmatch(r"[가-힣]{2,10}", line))


def is_address_line(line):
    # 직급/직무로 보이는 조각이 있으면 먼저 주소가 아니라고 확정한다. "프로젝트건축사·설계2팀"
    # 처럼 로고체 단어 안에 우연히 주소 접미사 글자가 섞이고("프로젝트"의 "로") 부서 번호에
    # 숫자까지 있으면, 아래 has_unit+has_digit 조건에 걸려 통째로 주소로 오분류되는 문제가
    # 실측(합성 명함)으로 확인됐다. 다만 "KT우면연구센터"처럼 건물명이 부서 접미사("센터")와
    # 우연히 겹치는 경우도 있어(실측: 실제 명함 주소가 통째로 날아감), 다른 조각에 확실한 주소
    # 증거(행정단위 글자 + 숫자가 같은 조각에 함께 있음)가 이미 있으면 이 예외를 적용하지 않는다.
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
    # OCR이 지역명 뒤에 따옴표 같은 잡음 기호를 붙이는 경우가 있어("서울특별시'") 판단 전에
    # 한글/숫자가 아닌 꼬리 문자를 지운다.
    stripped = re.sub(r"[^가-힣0-9]+$", "", line.strip())
    # OCR이 "서울특별시" / "마포구" / "어울마당로 100,2층(서교동)"처럼 주소를 세 줄로 쪼개
    # 인식하는 경우가 실측(합성 명함)으로 확인됐다. 번지수가 있는 마지막 줄만 주소로 잡히고
    # 앞의 시/도·시/군/구 줄은 아래 "2개 이상 연속" 조건을 혼자서는 못 채워 누락됐다. 줄 전체가
    # 시/도 이름 또는 시/군/구 이름 그 자체뿐이면(다른 정보와 섞일 여지가 없어 안전) 주소로 인정한다.
    if stripped.endswith(SIDO_SUFFIXES) or stripped in SIDO_ABBR:
        return True
    if (2 <= len(stripped) <= 6 and stripped.endswith(SIGUNGU_SUFFIXES)
            and re.fullmatch(r"[가-힣]+", stripped)):
        return True
    # 번지수 없이 "경기도 성남시 분당구"처럼 행정단위 접미사가 2개 이상 연속인 줄만 예외적으로
    # 주소로 인정하는 부분. "리"/"로"/"동" 같은 접미사가 한 글자라 "계약관리"·"운영관리"처럼
    # 부서명 접미사(DEPT_SUFFIXES)로 끝나는 일반 단어와 우연히 겹칠 수 있어(실측: "계약관리
    # 주임·계약관리"가 주소로 오분류됨), 부서 접미사로 끝나는 단어는 주소 후보에서 제외한다.
    unit_words = [w for w in line.split()
                  if len(w) >= 2 and w.endswith(ADDR_WORD_SUFFIXES) and not w.endswith(DEPT_SUFFIXES)]
    return len(unit_words) >= 2


def is_name_candidate_token(tok):
    return bool(re.fullmatch(r"[가-힣]+", tok)) and 2 <= len(tok) <= 4


def is_department_token(tok):
    if 2 <= len(tok) <= 30 and tok.endswith(DEPT_SUFFIXES):
        return True
    return tok.replace(" ", "").lower() in ENGLISH_DEPT_WORDS


PAREN_SUFFIX_RE = re.compile(r"\([^()]*\)$")  # "최고투자책임자(CIO)"처럼 끝에 붙는 괄호 부연설명


def is_title_token(tok):
    # 끝에 괄호 설명이 붙은 경우("전문위원(세무)", "최고투자책임자(CIO)") 괄호를 뗀 나머지로
    # 접미사를 판단한다. 저장값은 원래 tok을 그대로 쓰므로(호출부에서 tok 사용) 괄호 설명은
    # 그대로 보존된다 — 판단 기준만 완화하는 것이지 값을 바꾸는 게 아니다.
    core = PAREN_SUFFIX_RE.sub("", tok)
    if 2 <= len(core) <= 20 and core.endswith(TITLE_SUFFIXES):
        return True
    if ENGLISH_TITLE_RE.fullmatch(tok):
        return True
    return core.replace(" ", "").lower().endswith(ENGLISH_TITLE_SUFFIXES)


def split_glued_title_name(tok):
    """OCR이 "이사손민", "대표전해원", "공인중개사김라라"처럼 직급과 이름을 공백 하나 없이
    통째로 붙여 읽은 경우, 앞부분이 알려진 직급 키워드와 일치하면 (직급, 이름후보)로 분리한다.
    못 찾으면 None. 가장 긴 직급 키워드부터 확인해서, 짧은 키워드가 우연히 앞부분과 겹쳐
    잘못된 지점에서 잘리는 걸 방지한다."""
    if not re.fullmatch(r"[가-힣]{4,10}", tok):
        return None
    for suf in sorted(TITLE_SUFFIXES, key=len, reverse=True):
        if tok.startswith(suf):
            rest = tok[len(suf):]
            if is_name_candidate_token(rest):
                return suf, rest
    return None


def surname_rank(tok):
    """이름 후보 토큰의 성씨 우선순위(낮을수록 흔한 성씨)를 반환. 목록에 없으면 None."""
    if tok[:2] in COMPOUND_SURNAME_RANK:
        return COMPOUND_SURNAME_RANK[tok[:2]]
    if tok[0] in SURNAME_RANK:
        return SURNAME_RANK[tok[0]]
    return None


def split_address(address):
    """주소 원문 -> (우편번호, 지역). 패턴에 안 걸리면 None."""
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
    """OCR 텍스트 라인 목록 -> (필드 dict, 기타 목록) 튜플."""
    # 문자/숫자가 하나도 없는 줄(아이콘을 잘못 읽은 기호 등)은 애초에 제외.
    # 글자 사이가 벌어진 로고체 줄은 여기서 한 번에 정리해서, 이후 모든 필드 판별이 같은
    # 정규화된 텍스트를 기준으로 이뤄지도록 한다.
    remaining = [collapse_spaced_hangul(l) for l in lines if HAS_CONTENT_RE.search(l)]
    result = {key: None for key in FIELD_KEYS}
    etc = []

    def take_matches(pattern, key, label):
        # 매칭된 부분만 줄에서 잘라내고, 남은 텍스트에 다른 정보가 있으면 그대로 remaining에
        # 남겨둔다. 이전에는 매칭되면 줄 전체를 지웠는데, "010-3480-6120 mjang@a.com"처럼
        # 전화번호와 이메일이 한 줄에 같이 찍힌 경우(실측: law/luxury 템플릿) 이메일을 먼저
        # 뽑으면서 같은 줄의 전화번호까지 통째로 사라지는 문제가 있었다.
        for line in list(remaining):
            m = pattern.search(line)
            if not m:
                continue
            value = m.group(0)
            if key == "email":
                value = re.sub(r"\s+", "", value)
                value = LABEL_PREFIX_RE.sub("", value)
                value = GLUED_LABEL_PREFIX_RE.sub("", value)
            if result[key] is None:
                result[key] = value
            else:
                etc.append(f"{label}:{value}")
            idx = remaining.index(line)
            rest = (line[:m.start()] + line[m.end():]).strip()
            # 라벨 글자 하나만 남으면("M 010-..." -> "M") 버린다. 이런 1글자 잔여물을 그대로
            # 남기면 "kt"처럼 실제로 짧은 회사명과 구분이 안 돼(둘 다 로고 모노그램 판별 규칙에
            # 걸림) 순서상 먼저 나온 라벨 잔여물이 회사명으로 잘못 채택되는 문제가 있었다.
            if rest and len(rest) >= 2 and HAS_CONTENT_RE.search(rest):
                remaining[idx] = rest
            else:
                remaining.pop(idx)

    take_matches(EMAIL_RE, "email", "이메일")
    take_matches(PHONE_RE, "phone", "전화")

    # 주소가 여러 줄에 걸쳐 찍힌 경우를 대비해, 주소로 보이는 줄을 하나만 채택하지 않고
    # 끝까지 전부 찾아서 순서대로 이어붙인다.
    address_parts = []
    for line in list(remaining):
        if is_address_line(line):
            address_parts.append(strip_label_prefix(line.strip()))
            remaining.remove(line)
    if address_parts:
        result["address"] = " ".join(address_parts)

    # 줄마다 토큰을 분류한다: 직무 접미사 -> 바로 확정, 직급 키워드 -> 바로 확정,
    # 나머지 2~4자 한글은 이름 후보로 보류(이 줄이 나중에 회사명으로 채택될 수도 있어 바로 버리지 않는다).
    line_candidates = []
    line_leftovers = []
    dept_lines = set()
    title_lines = set()
    for idx, line in enumerate(remaining):
        seg_tokens = [t.strip() for t in SEPARATOR_RE.split(line) if t.strip()]
        # 구두점 구분자 없이 공백만으로 나뉜 경우("이사 손민")도 있고, OCR이 한 단어 중간에
        # 스퓨리어스 공백을 끼워넣은 경우("이 연희")도 있어 판단이 갈린다. 구분자 조각 단위로
        # 각각 판단해서, 한 줄에 구분자와 스퓨리어스 공백이 섞여 있어도 서로 영향받지 않게 한다.
        tokens = []
        for seg in seg_tokens:
            parts = [p for p in seg.split(" ") if p]
            # "이사 손민"처럼 직급/직무 키워드가 섞여 있을 때만 부분별로 쪼갠다. 이 조건이 없으면
            # "스튜디오 오르빗"처럼 회사명이 우연히 2~4자 한글 두 단어로 되어 있을 때도 똑같이
            # 쪼개져서, 둘째 단어("오르빗")가 성씨처럼 보여 실제 이름을 밀어내고 이름으로
            # 잘못 채택되는 문제가 실측(합성 명함)으로 확인됐다. 회사명은 직급/직무 키워드를
            # 포함하지 않으므로, "부분 중 하나가 직급/직무로 확실히 인식되는 경우"로 제한하면
            # "이사 손민" 같은 정상 케이스는 그대로 두면서 회사명 오분류만 막을 수 있다.
            part_is_role = [is_department_token(p) or is_title_token(p) for p in parts]
            has_role_word = any(part_is_role)
            if len(parts) >= 2 and has_role_word and all(part_is_role):
                # "재무팀 과장", "바리스타 팀장"처럼 직급/직무 키워드 두 개가 이어진 복합 표현은
                # 하나로 합쳐야 전체("재무팀 과장")가 온전히 title로 잡힌다. 따로 쪼개면 "재무팀"은
                # 부서 접미사("팀")에 걸려 department로, "과장"은 title로 각각 따로 채택되면서
                # 정작 title에는 앞부분이 잘린 "과장"만 남는 문제가 실측으로 확인됐다.
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
                # split_glued_title_name을 is_name_candidate_token보다 먼저 확인한다.
                # "이사손민"(4자)은 그 자체로 이미 is_name_candidate_token 범위(2~4자)에 들어가
                # 나중에 확인하면 이 분리 로직에 도달하지도 못한 채 통째로 이름 후보가 되어버린다
                # (실측으로 확인됨 — split_glued_title_name이 5자 이상 토큰에서만 동작하고 있었음).
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

    # 이름: 상위 성씨(흔한 순서) 기준으로 가장 우선순위 높은 후보를 채택. 한국 이름은 대부분
    # 3자(성1+이름2)라서 3자 후보를 먼저 찾고, 없을 때만 다른 길이(2~4자)까지 넓힌다 -> 배경에
    # 우연히 찍힌 짧은 한글 단어가 실제 이름보다 흔한 성씨로 시작한다는 이유만으로 잘못 채택되는
    # 경우를 줄인다. 성씨 목록에 아무 후보도 없으면 순서상 첫 후보를 그대로 채택한다.
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

    # 직급을 키워드 목록으로 못 찾았으면(카드에 흔치 않은 표현), 이름과 같은 줄에 남은 후보를
    # 우선 직급으로 추정하고(라벨이 이름 바로 옆에 오는 경우가 흔함), 없으면 이름 줄과 같거나
    # 그 아래 줄에서 채택한다. 이름보다 위쪽 줄은 대개 회사명/로고 영역이라(예: "아르장"처럼
    # 짧은 한글 회사명이 이름 후보로 오인되는 경우) 여기서 후보로 쓰면 회사명을 가로채버리므로
    # 제외한다 — 못 찾으면 직급은 빈 값으로 남기는 쪽이 회사명을 빼앗는 것보다 안전하다.
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

    # 회사: 이름/직급/직무로 쓰이지 않은 줄 중 순서상 첫 줄을 기본으로 고르되, 로고 이니셜
    # (예: "BL", "NW" 같은 1~3자 대문자 모노그램)처럼 정보량이 거의 없는 줄은 다른 후보가 있으면
    # 뒤로 미룬다. 바로 위/아래 줄이 업종/부제처럼 순수 한글 단어로만 된 짧은 줄이면 함께 붙인다
    # (회사 로고 문구가 "회사명"+"업종" 두 줄로 나뉘는 경우 대응). URL·전화번호 잔여물처럼
    # 관련 없는 줄까지 끌려오지 않도록 병합 대상은 순수 한글 줄로 제한한다.
    #
    # 예전에는 "이름 후보 토큰이 하나도 없는 줄"을 최우선으로 골랐는데, 실측(합성 명함) 결과
    # 아래 두 경우에 실제 회사명이 밀려나는 문제가 확인되어 로직을 바꿨다:
    #   - "주식회사 블루라인"처럼 한글 2단어(각 2~4자)로 된 회사명은 두 단어 다 "이름 후보"로
    #     오인되어 제외되고, 대신 로고 이니셜 "BL"이 회사명으로 뽑힘
    #   - "아르장"처럼 회사명 자체가 2~4자 짧은 한글 단어면 그 자체가 "이름 후보"로 오인되어
    #     제외되고, 대신 영문 부제 "ARGENT ATELIER"가 회사명으로 뽑힘
    # "KT"처럼 실제 회사명이 짧은 경우는 경쟁할 다른 후보 줄이 없으면 그대로 채택되므로 문제없다.
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
