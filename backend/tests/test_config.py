from app.config import Settings


def test_settings_defaults_match_local_docker_compose() -> None:
    settings = Settings(_env_file=None)
    assert settings.database_url == "mysql+asyncmy://cardn:cardn@localhost:3307/cardn_db"
    assert settings.neo4j_uri == "bolt://localhost:7687"
    assert settings.neo4j_user == "neo4j"
    assert settings.neo4j_password == "cardncardn123"
