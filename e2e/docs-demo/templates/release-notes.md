# {{ product_name }} {{ version }} — Release Notes

_Released {{ release_date }}_

## Highlights

{% for item in highlights %}

- **{{ item.title }}** — {{ item.summary }}
  {% endfor %}

## Fixes

{% for fix in fixes %}

- {{ fix }}
  {% endfor %}

## Upgrade notes

{{ upgrade_notes | default("No action required — this release is backward compatible.") }}

Thanks to everyone who reported issues and sent feedback this cycle.
