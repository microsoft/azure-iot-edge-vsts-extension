tfx extension create --manifest-globs vss-extension.json --overrides-file ./build-test-config.json
tfx extension publish --manifest-globs vss-extension.json --overrides-file ./build-test-config.json --share-with zhqqitest
# 72516779-4009-45e2-9862-abaabb043081