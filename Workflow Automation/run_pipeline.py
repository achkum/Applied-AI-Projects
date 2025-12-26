import yaml
from src.core.pipeline import MainPipeline
from src.utils.logger import logger

def run():
    try:
        with open("config.yaml", "r") as f:
            config = yaml.safe_load(f)
        
        api_key = config.get("gemini_api_key")
        if not api_key:
            logger.error("Gemini API Key missing")
            return

        logger.info("Starting Email Workflow Pipeline...")
        pipeline = MainPipeline(api_key=api_key)
        pipeline.run("gmail_token.json")
        logger.info("Execution complete.")
    except Exception as e:
        logger.error(f"Pipeline failed: {e}")

if __name__ == "__main__":
    run()
