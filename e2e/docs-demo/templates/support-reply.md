Subject: Re: {{ ticket_subject }} (#{{ ticket_id }})

Hi {{ customer_name }},

Thanks for reaching out about {{ topic }}. I'm sorry for the trouble.

{{ resolution }}

{% if follow_up %}
I'll check back in {{ follow_up }} to make sure everything is working as
expected.
{% endif %}

In the meantime, our docs on {{ topic }} may help: {{ docs_url }}

Best,
{{ agent_name }}
{{ product_name }} Support
