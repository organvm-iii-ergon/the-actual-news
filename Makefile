export PLATFORM_ID ?= $(PLATFORM_ID)
export POSTGRES_URI ?= $(POSTGRES_URI)

.PHONY: up down migrate reset lint test dev dev-minimal

up:
	docker compose -f infra/docker-compose.yml up -d

down:
	docker compose -f infra/docker-compose.yml down -v

migrate:
	POSTGRES_URI="$(POSTGRES_URI)" bash tools/migrate.sh

reset: down up migrate

lint:
	npx @redocly/cli lint contracts/openapi/*.yaml

test:
	node tools/conformance/run.mjs

dev:
	pnpm -r --parallel dev

dev-minimal:
	cd services/gateway && pnpm dev
