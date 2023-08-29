import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Starting up. Importing libraries...")

import asyncio
import traceback
from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import APIKeyHeader
from starlette.status import HTTP_403_FORBIDDEN
from typing import List, Optional
import os
from asyncio import Semaphore
import tensorflow_hub as hub
from pydantic import BaseModel
import time

MAX_CONCURRENT_INFERENCES = 4; # adjust this number based on your resources
API_KEY_NAME = "Authorization"
API_KEY = os.getenv("SHORT_EMBEDDINGS_API_KEY")

api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

app = FastAPI()
semaphore = Semaphore(MAX_CONCURRENT_INFERENCES) 

logger.info("Loading model...")
model = hub.load('https://tfhub.dev/google/universal-sentence-encoder/4')
logger.info("Model loaded!")

class EmbeddingOutput(BaseModel):
    vector: Optional[List[float]]
    errorMessage: Optional[str]

logger.info("Ready to accept connections!")

async def get_api_key(api_key_header: str = Depends(api_key_header)):
    if api_key_header != API_KEY:
        raise HTTPException(
            status_code=HTTP_403_FORBIDDEN, detail="Could not validate credentials"
        )
    return api_key_header

@app.get("/embedParagraph/", response_model=EmbeddingOutput)
async def embed_paragraph(text: str, api_key: str = Depends(get_api_key)):
    start_time = time.time()
    try:
        await asyncio.wait_for(semaphore.acquire(), timeout=2)
        # Load model and get embedding
        vector = model([text]).numpy().tolist()[0]
        return {"vector": vector, "errorMessage": None}
    except asyncio.TimeoutError:
        logger.warning("Reached maximum concurrent model inferences limit of " + str(MAX_CONCURRENT_INFERENCES))
        return {"vector": None, "errorMessage": "Reached maximum concurrent model inferences limit of " + str(MAX_CONCURRENT_INFERENCES)}
    except Exception as e:
        err_msg = traceback.format_exc()
        logger.error("Error running inference: ")
        logger.error(err_msg)
        return {"vector": None, "errorMessage": err_msg}
    finally:
        semaphore.release()
        elapsed_time = time.time() - start_time
        logger.info(f"Request took {elapsed_time} seconds.")
