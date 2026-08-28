from cardcreate import storage


def test_save_illustration_writes_the_file_and_returns_a_bare_filename(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ILLUSTRATIONS_DIR", tmp_path / "illustrations")

    stored = storage.save_illustration(42, b"PNGDATA")

    # bare filename, same convention as Person.image_path (not "illustrations/42.png")
    assert stored == "42.png"
    assert (tmp_path / "illustrations" / "42.png").read_bytes() == b"PNGDATA"


def test_card_illustration_path_resolves_under_the_illustrations_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(storage, "ILLUSTRATIONS_DIR", tmp_path / "illustrations")

    stored = storage.save_illustration(7, b"x")

    assert storage.card_illustration_path(stored) == tmp_path / "illustrations" / "7.png"
