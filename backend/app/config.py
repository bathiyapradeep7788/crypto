from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    supabase_url: str = ""
    supabase_key: str = ""
    binance_base_url: str = "https://api.binance.com"
    # Public market-data mirror — NOT geo-blocked from US datacenters (Vercel),
    # unlike api.binance.com which returns HTTP 451 there. Used for klines /
    # ticker reads. Signed trading calls still use binance_base_url/demo_url.
    binance_data_url: str = "https://data-api.binance.vision"
    binance_demo_url: str = "https://testnet.binance.vision"
    binance_api_key: str = ""
    binance_api_secret: str = ""
    anthropic_api_key: str = ""
    render_api_key: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
