from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    binance_base_url: str = "https://api.binance.com"
    binance_demo_url: str = "https://testnet.binance.vision"
    binance_api_key: str = ""
    binance_api_secret: str = ""
    anthropic_api_key: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
