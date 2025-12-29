from fastapi import FastAPI
from src.api.routes import router as api_router
from src.db.session import init_db

app = FastAPI(title="AML & Sanctions Intelligence API")
init_db() # Ensure tables are created

# Include modular routes
app.include_router(api_router, prefix="/v1")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
