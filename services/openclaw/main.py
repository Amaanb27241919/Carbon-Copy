from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, analyze, generate

app = FastAPI(
    title="OpenClaw - AI Code Intelligence",
    description="AI-powered code analysis and generation service",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — restricted to internal Docker network use
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(health.router, tags=["health"])
app.include_router(analyze.router, tags=["analyze"])
app.include_router(generate.router, tags=["generate"])
