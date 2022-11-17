src/proto/messaging.gen.ts: node_modules/@dcl/protocol/proto/decentraland/kernel/comms/v3/messaging.proto
	mkdir -p src/proto
	node_modules/.bin/protoc \
		--plugin=./node_modules/.bin/protoc-gen-ts_proto \
		--ts_proto_opt=esModuleInterop=true,returnObservable=false,outputServices=generic-definitions,oneof=unions \
		--ts_proto_opt=fileSuffix=.gen \
		--ts_proto_out="$(PWD)/src/proto" \
		-I="$(PWD)/node_modules/@dcl/protocol/proto/decentraland/kernel/comms/v3/" \
		-I="$(PWD)/node_modules/@dcl/protocol/proto/" \
	"$(PWD)/node_modules/@dcl/protocol/proto/decentraland/kernel/comms/v3/messaging.proto"

build: src/proto/messaging.gen.ts
	@rm -rf dist || true
	@mkdir -p dist
	@./node_modules/.bin/tsc -p tsconfig.json

lint:
	@node_modules/.bin/eslint . --ext .ts

lint-fix: ## Fix bad formatting on all .ts and .tsx files
	@node_modules/.bin/eslint . --ext .ts --fix

install:
	npm ci

profile: build
	node \
		--trace-warnings \
		--abort-on-uncaught-exception \
		--unhandled-rejections=strict \
		--inspect \
		dist/index.js

start: build
	npm run start

test:
	npm run test

.PHONY: build lint lint-fix install start test
