IMAGE_NAME=3dprintlibrary
TAG=latest

DOCKER_REGISTRY=docker.io
DOCKER_USERNAME=jeroenkeizernl

GITHUB_REGISTRY=ghcr.io
GITHUB_USERNAME=jeroenkeizernl

.PHONY: pull build run test publish clean shell

pull:
	@echo "📥 Pulling latest source..."
	git pull

build: pull clean
	@echo "🐳 Building Docker image..."
	docker build -t $(IMAGE_NAME):$(TAG) .

run: build
	@echo "🚀 Running container (port 3000)..."
	@docker rm -f $(IMAGE_NAME) 2>/dev/null || true
	docker run -d --name $(IMAGE_NAME) -p 3000:3000 $(IMAGE_NAME):$(TAG)

test: build
	@echo "🧪 Testing container starts and responds..."
	@docker rm -f $(IMAGE_NAME) 2>/dev/null || true
	docker run -d --name $(IMAGE_NAME) -p 3123:3123 $(IMAGE_NAME):$(TAG)
	@sleep 2
	@docker run --rm --network host curlimages/curl -sS -o /dev/null -w "%{http_code}" http://localhost:3123 | grep -q '^2' && echo "✅ OK" || (echo "❌ Failed to reach server" && exit 1)
	@docker rm -f $(IMAGE_NAME)

publish: test
	@echo "📦 Tagging for registry..."
	docker tag $(IMAGE_NAME):$(TAG) $(DOCKER_REGISTRY)/$(DOCKER_USERNAME)/$(IMAGE_NAME):$(TAG)
	docker tag $(IMAGE_NAME):$(TAG) $(GITHUB_REGISTRY)/$(GITHUB_USERNAME)/$(IMAGE_NAME):$(TAG)

	@echo "📤 Pushing to Docker Hub..."
	docker push $(DOCKER_REGISTRY)/$(DOCKER_USERNAME)/$(IMAGE_NAME):$(TAG)
	@echo "📤 Pushing to GitHub Packages..."
	docker push $(GITHUB_REGISTRY)/$(GITHUB_USERNAME)/$(IMAGE_NAME):$(TAG)

clean:
	@echo "🧹 Cleaning up containers and images..."
	-docker rm -f $(IMAGE_NAME) 2>/dev/null || true
	-docker rmi -f $(IMAGE_NAME):$(TAG) 2>/dev/null || true
	-docker rmi -f $(DOCKER_REGISTRY)/$(DOCKER_USERNAME)/$(IMAGE_NAME):$(TAG) 2>/dev/null || true
	-docker rmi -f $(GITHUB_REGISTRY)/$(GITHUB_USERNAME)/$(IMAGE_NAME):$(TAG) 2>/dev/null || true
	-docker rmi -f curlimages/curl:latest 2>/dev/null || true	
shell: run
	@docker exec -it $(IMAGE_NAME) /bin/sh


