import zipfile, os

path = r"A:\aireceptionistgooglecli\loggix-voice-agent\tools\ngrok-v3.zip"
print("Exists:", os.path.exists(path))
print("Size:", os.path.getsize(path))

z = zipfile.ZipFile(path, "r")
z.extractall(r"A:\aireceptionistgooglecli\loggix-voice-agent\tools")
z.close()
print("Extracted OK")

# Check what was extracted
for f in os.listdir(r"A:\aireceptionistgooglecli\loggix-voice-agent\tools"):
    fp = os.path.join(r"A:\aireceptionistgooglecli\loggix-voice-agent\tools", f)
    if os.path.isfile(fp):
        print(f"  {f}: {os.path.getsize(fp)} bytes")
