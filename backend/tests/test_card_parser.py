from app.features.scan.ocr.card_parser import parse_fields


def test_dot_separated_phone_is_extracted():
    # Regression: PHONE_RE only accepted dash/space separators, so a dot-separated
    # number (e.g. "02.597.0443") was never matched at all — take_matches() left it
    # untouched, and if it shared a line with an address, the whole line (address +
    # phone + fax) ended up glued into the address field instead (confirmed on a real
    # card).
    fields, _etc = parse_fields(["02.597.0443"])
    assert fields["phone"] == "02.597.0443"


def test_contact_label_word_is_not_picked_as_name():
    # Regression: once a phone number is cut out of a line by take_matches(), the
    # label word left behind ("직통번호") is pure Hangul, 2-4 characters — exactly the
    # shape a name candidate is judged by — and with no other name candidate on the
    # card, it was the one accepted as the name (confirmed on a real card, saved as the
    # contact's name).
    fields, _etc = parse_fields(["직통번호:070.4756.5296"])
    assert fields["phone"] == "070.4756.5296"
    assert fields["name"] is None


def test_real_name_still_recognized_next_to_a_label_leftover():
    # The label-word exclusion above must not swallow an actual name that happens to
    # sit on another line of the same card.
    fields, _etc = parse_fields(["직통번호:070.4756.5296", "김민수"])
    assert fields["name"] == "김민수"
