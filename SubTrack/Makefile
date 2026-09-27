COMPOSE ?= docker compose
# The API scaffold does not yet provide db:seed. Override when a local seed exists:
# make seed SEED_COMMAND='pnpm --filter @subtrack/api db:seed'
SEED_COMMAND ?= pnpm --filter @subtrack/api db:seed

.PHONY: up logs down seed

up:
	$(COMPOSE) up -d --wait

logs:
	$(COMPOSE) logs --follow

down:
	$(COMPOSE) down

seed:
	$(SEED_COMMAND)
