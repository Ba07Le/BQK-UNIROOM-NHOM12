from .main import app
from .room_manager_level1 import router as room_manager_level1_router


app.include_router(room_manager_level1_router)
