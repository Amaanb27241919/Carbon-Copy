from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import health, classify, summarize, embed

app = FastAPI(
    title="NemoClaw - AI Language Intelligence",
    description="AI-powered NLP service for classification, summarization, and embeddings",
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
app.include_router(classify.router, tags=["classify"])
app.include_router(summarize.router, tags=["summarize"])
app.include_router(embed.router, tags=["embed"])
