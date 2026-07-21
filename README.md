# ExpenseDashboard

`docker buildx create --name multi-builder --use`

`docker buildx inspect --bootstrap`

`docker buildx build --platform linux/amd64,linux/arm64 -t rkumar0206/expense-dashboard:v1.0.0 --push .`
