# The setup and status page of the Buzz Relay app for umbrelOS: one Python file, standard library only.
# GitHub Actions builds it for linux/amd64 and linux/arm64 from a tag umbrel-setup-vX.Y.Z, after the
# page's tests pass, and publishes it with build provenance (.github/workflows/umbrel-setup-page.yml).
FROM python:3.13.16-alpine3.24@sha256:2d9aefe2fef018a7eb2c13064c89c71929800fd2e5dccdbf52ea5da5bb8d929a
ENV PYTHONDONTWRITEBYTECODE=1
COPY setup.py /app/setup.py
USER 1000:1000
EXPOSE 8080
CMD ["python3", "-u", "/app/setup.py"]
