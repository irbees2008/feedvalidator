all: docs ../docs/index.html

.PHONY: missing docs

missing:
	python mkmsgs.py

SOURCES=$(wildcard error/*.xml warning/*.xml info/*.xml)

docs: $(patsubst %.xml, ../docs/%.html, $(SOURCES))

../docs/%.html: %.xml template.html build-html-docs.py
	python build-html-docs.py template.html ../docs $<

../docs/index.html: docs-index-header.html error/*.xml warning/*.xml info/*.xml docs-index-footer.html build-docs-index.py ../templates/partials/menu.json
	python build-docs-index.py
