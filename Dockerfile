FROM astral/uv:python3.12-bookworm-slim

# Set the working directory
WORKDIR /app

# Copy the application code
COPY src/ ./src/

# Command to run the application
CMD ["uv", "run", "python", "/app/src/main.py"]