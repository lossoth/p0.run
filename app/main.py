"""Production Incident Game - Main Application."""

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config.database import SessionLocal, init_db
from app.models import User, Scenario, Node, Action, Edge, Attempt, AttemptAction
from app.services.incident_loader import IncidentLoader
from app.api.scenarios import router as scenarios_router
from app.api.attempts import router as attempts_router
from app.api.leaderboard import router as leaderboard_router
from app.api.daily import router as daily_router

APP_ENV = os.getenv("APP_ENV", "dev")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    
    db = SessionLocal()
    try:
        scenario_count = db.query(Scenario).count()
        
        if scenario_count == 0:
            logger.info("Seeding incidents...")
            
            base_dir = Path(__file__).resolve().parent.parent
            incidents_dir = base_dir / "incidents"
            incident_files = list(incidents_dir.glob("*.incident"))

            
            if not incident_files:
                logger.info("No incident files found in /app/incidents, skipping seed")
            else:
                loader = IncidentLoader(db)
                loaded_count = 0
                
                for incident_file in incident_files:
                    try:
                        loader.load_file(str(incident_file), overwrite=False)
                        loaded_count += 1
                    except Exception as e:
                        logger.error(f"Failed to load {incident_file.name}: {e}")
                
                logger.info(f"Loaded {loaded_count} incidents")
        else:
            logger.info("Skipping seed, scenarios already exist")
    finally:
        db.close()
    
    yield


app = FastAPI(
    title="Production Incident Game",
    debug=APP_ENV == "dev",
    docs_url="/docs" if APP_ENV != "prod" else None,
    redoc_url="/redoc" if APP_ENV != "prod" else None,
    openapi_url="/openapi.json" if APP_ENV != "prod" else None,
    lifespan=lifespan,
)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")

app.include_router(attempts_router)
app.include_router(scenarios_router)
app.include_router(leaderboard_router)
app.include_router(daily_router)


@app.get("/static/")
async def static_index():
    """Serve the main HTML file from /static/."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
async def root():
    """Serve the main HTML file."""
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "app": "Production Incident Game", "env": APP_ENV}

# Print all registered routes for debugging purposes
for route in app.routes:
    print(f"Path: {route.path}, Name: {route.name}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
