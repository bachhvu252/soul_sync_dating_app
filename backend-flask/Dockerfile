FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 5001
ENV FLASK_APP=app
CMD ["flask", "run", "--host", "0.0.0.0", "--port", "5001"]
