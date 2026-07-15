import os
import httpx


CAL_API_BASE = "https://api.cal.com/v2"


class CalClient:
    def __init__(self):
        self.api_key = os.getenv("CAL_API_KEY")
        self.event_type_id = int(os.getenv("CAL_EVENT_TYPE_ID", "0"))
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "cal-api-version": "2024-08-13",
            "Content-Type": "application/json"
        }

    async def create_booking(
        self,
        start: str,
        attendee_name: str,
        attendee_email: str,
        attendee_timezone: str = "UTC",
        phone: str = None,
        notes: str = None
    ) -> dict:
        """Create a booking on Cal.com.
        
        Args:
            start: ISO 8601 UTC time (e.g., "2024-08-13T09:00:00Z")
            attendee_name: Caller's name
            attendee_email: Caller's email
            attendee_timezone: Caller's timezone
            phone: Optional phone number
            notes: Optional notes about the enquiry
        """
        payload = {
            "eventTypeId": self.event_type_id,
            "start": start,
            "attendee": {
                "name": attendee_name,
                "email": attendee_email,
                "timeZone": attendee_timezone,
                "language": "en"
            }
        }
        
        if phone:
            payload["attendee"]["phoneNumber"] = phone
        
        if notes:
            payload["bookingFieldsResponses"] = {"notes": notes}
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{CAL_API_BASE}/bookings",
                headers=self.headers,
                json=payload
            )
            return response.json()

    async def get_event_type_id(self, slug: str, username: str) -> int:
        """Get event type ID from slug and username."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{CAL_API_BASE}/event-types",
                headers=self.headers
            )
            data = response.json()
            if data.get("status") == "success":
                for et in data.get("data", []):
                    if et.get("slug") == slug:
                        return et.get("id")
        return None
