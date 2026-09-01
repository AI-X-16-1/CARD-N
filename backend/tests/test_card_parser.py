# Every fixture below is anonymized. The names, company, address, phone/fax numbers
# and emails are stand-ins chosen to preserve the *shape* the parser keys off (a
# surname the name table knows, a 시/군/구-colliding final syllable, dot-separated
# numbers, a 대로NN길NN street). Do not paste real scanned card data back in.
from app.features.scan.ocr.card_parser import parse_fields


def test_dot_separated_phone_is_extracted():
    # Regression: PHONE_RE only accepted dash/space separators, so a dot-separated
    # number (e.g. "02.123.4567") was never matched at all — take_matches() left it
    # untouched, and if it shared a line with an address, the whole line (address +
    # phone + fax) ended up glued into the address field instead (confirmed on a real
    # card).
    fields, _etc = parse_fields(["02.123.4567"])
    assert fields["phone"] == "02.123.4567"


def test_contact_label_word_is_not_picked_as_name():
    # Regression: once a phone number is cut out of a line by take_matches(), the
    # label word left behind ("직통번호") is pure Hangul, 2-4 characters — exactly the
    # shape a name candidate is judged by — and with no other name candidate on the
    # card, it was the one accepted as the name (confirmed on a real card, saved as the
    # contact's name).
    fields, _etc = parse_fields(["직통번호:070.1234.5678"])
    assert fields["phone"] == "070.1234.5678"
    assert fields["name"] is None


def test_real_name_still_recognized_next_to_a_label_leftover():
    # The label-word exclusion above must not swallow an actual name that happens to
    # sit on another line of the same card.
    fields, _etc = parse_fields(["직통번호:070.1234.5678", "김민수"])
    assert fields["name"] == "김민수"


def test_name_that_looks_like_a_district_name_is_not_swallowed_by_address():
    # Regression: "홍길구" has the shape of a real Korean name (surname 홍 + given
    # name 길구) that also happens to match the "bare 시/군/구 line" address heuristic
    # (the same shape as e.g. "강남구"). It was getting classified as an address line
    # and removed from
    # `remaining` before name-candidate collection ever ran, losing the name entirely
    # (confirmed on a real card — name ended up None, "홍길구" glued onto the front of
    # the address field instead).
    fields, _etc = parse_fields(["홍길구", "서울시 강남구 샘플대로12길34"])
    assert fields["name"] == "홍길구"
    assert "홍길구" not in (fields["address"] or "")


def test_name_next_to_role_line_recognized_even_without_a_full_address_elsewhere():
    # Regression: the original "홍길구" fix (test_name_that_looks_like_a_district_name_
    # is_not_swallowed_by_address above) only defers to name when *another* line already
    # has a complete unit+digit address. On a real scan, the street-number line can come
    # back split across two OCR reads (e.g. a blurry/skewed photo), so no single line
    # ever satisfies that check — and the name gets swallowed into address (and even
    # `region`) again, with `name` ending up None. Reproduced directly from the same
    # real card, with its address line split the way a genuine OCR read did.
    fields, _etc = parse_fields([
        "SAMPLE DESIGN ARCHITECTURE GROUP",
        "설계본부 대리",
        "홍길구",
        "서울시 강남구",
        "010.1234.5678",
    ])
    assert fields["name"] == "홍길구"
    assert "홍길구" not in (fields["address"] or "")


def test_real_district_only_line_is_still_recognized_as_address():
    # The fix above must not break the case it's carved out of: a bare region name with
    # no personal-name collision should still count as an address line (an OCR split
    # like "서울특별시" / "마포구" / "street with a number" across three lines is a real,
    # previously-confirmed pattern — see is_address_line's own comments).
    fields, _etc = parse_fields(["마포구"])
    assert fields["address"] == "마포구"


def test_two_phone_numbers_on_one_line_are_both_cut_out():
    # Regression: take_matches() only searched each line once, so a second phone number
    # sharing a line with the first (a common Tel/Fax footer) was left glued to
    # whatever else was on that line — on a real card, that meant the fax number
    # stayed embedded in the address field alongside the street address.
    fields, etc = parse_fields(["Tel:02.123.4567 Fax:02.123.4569"])
    assert fields["phone"] == "02.123.4567"
    assert any("02.123.4569" in item for item in etc)


def test_mobile_labeled_number_wins_over_an_earlier_office_number():
    # Regression: take_matches() took whichever line came first in reading order, which
    # is commonly the office/desk Tel line printed above the mobile line — so `phone`
    # (labeled "Mobile" in the UI) ended up holding the office number instead (confirmed
    # on a real card).
    fields, _etc = parse_fields(["Tel:02.123.4567", "Mobile:010.1234.5678"])
    assert fields["phone"] == "010.1234.5678"


def test_fax_number_never_becomes_phone():
    # A fax line appearing before any Tel/Mobile line must not win the `phone` slot —
    # a fax number isn't callable, so it belongs only in `etc`.
    fields, etc = parse_fields(["Fax:02.123.4569", "Tel:02.123.4567"])
    assert fields["phone"] == "02.123.4567"
    assert any("02.123.4569" in item for item in etc)


def test_single_letter_labels_are_recognized():
    # Cards commonly abbreviate to a single letter (T/F/M) instead of the full word.
    fields, etc = parse_fields(["T.02.123.4567", "F.02.123.4569", "M.010.1234.5678"])
    assert fields["phone"] == "010.1234.5678"
    assert any("02.123.4569" in item for item in etc)


def test_address_label_debris_is_cleaned_up():
    # Regression: once the Tel/Fax numbers are cut out by take_matches, the bare "Tel:"/
    # "Fax:" labels (and OCR's "~8" extension-range suffix) were left behind with
    # nothing anchoring them anymore, riding along into the address field alongside the
    # real street address (confirmed on a real card).
    fields, _etc = parse_fields(["서울시 강남구 샘플대로12길34 4,5층 Tel:02.123.4567~8 Fax:02.123.4569"])
    address = fields["address"] or ""
    assert "Tel" not in address
    assert "Fax" not in address
    assert "~8" not in address
    assert "샘플대로12길34" in address


def test_address_debris_cleanup_does_not_touch_a_real_floor_range():
    # ADDRESS_DEBRIS_RE's "~digits" removal is scoped to right after a Tel/Fax/Mobile
    # label — a real floor range like "4~5층" (not glued to any such label) must survive.
    fields, _etc = parse_fields(["서울시 강남구 샘플대로12길34 4~5층"])
    assert "4~5층" in (fields["address"] or "")


def test_real_card_end_to_end():
    # The raw OCR line *structure* of the real card behind all the regressions above,
    # captured via temporary debug logging and then anonymized. Locks in the combined fix.
    raw_lines = [
        "SAMPLE",
        "설계본부/대리",
        "DESIGN",
        "홍 길 구",
        "ARCHITECTURE GROUP",
        "(주)샘플종합건축사사무소",
        "서울시 강남구 샘플대로12길34 샘플빌딩 4,5층 Tel:02.123.4567~8 Fax:02.123.4569",
        "Mobile:010.1234.5678",
        "직통번호:070.1234.5678",
    ]
    fields, _etc = parse_fields(raw_lines)
    assert fields["name"] == "홍길구"
    assert fields["title"] == "대리"
    assert fields["department"] == "설계본부"
    assert fields["phone"] == "010.1234.5678"
    assert "홍길구" not in (fields["address"] or "")
