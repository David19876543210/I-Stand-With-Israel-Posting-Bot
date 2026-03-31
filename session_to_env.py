"""
Run this ONCE on your local machine to convert your session file
into a base64 string you can paste into Railway as an env variable.
"""
import base64
import os

session_file = "forwarder_session.session"

if not os.path.exists(session_file):
    print(f"❌ Session file '{session_file}' not found.")
    print("Make sure you've run bot.py at least once and logged in successfully.")
else:
    with open(session_file, "rb") as f:
        encoded = base64.b64encode(f.read()).decode("utf-8")
    print("✅ Copy this value and add it as SESSION_STRING in Railway environment variables:\n")
    print(encoded)
