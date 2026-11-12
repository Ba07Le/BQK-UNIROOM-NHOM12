from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
import re

class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

class LoginIn(BaseModel):
    email: str = Field(min_length=5, max_length=180)
    password: str

    @field_validator("email")
    @classmethod
    def validate_login_email(cls, value: str) -> str:
        # Accept local development domains such as uniroom.local used by seed accounts.
        value = value.strip().lower()
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
            raise ValueError("Email không đúng định dạng")
        return value

class BookingIn(BaseModel):
    room_id: int
    title: str = Field(min_length=3, max_length=180)
    purpose: str = ""
    attendee_count: int = Field(ge=1)
    start_at: datetime
    end_at: datetime

class ProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = ""

class RoomCreate(BaseModel):
    building_id: int
    room_type_id: int
    code: str
    name: str
    capacity: int = Field(ge=1)
    floor: int = 1
    description: str = ""
    status: str = "ACTIVE"

class DecisionIn(BaseModel):
    note: str = ""
