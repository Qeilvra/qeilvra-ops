# Confirmed customer operational access

Confirmed by the project owner in the reconciliation request on 6 October 2026.
This supersedes the unresolved customer-field statement in decision 012. It does
not claim that customer APIs, sites or managed-project relationships exist.

## Service Manager

May edit primary service contact name, service phone/email/notes, site contact
details, site access instructions, site operational notes, preferred service or
contact method, and service-related tags/status where applicable. Site scope
includes site name, contact, phone, email, address/location, access instructions
and service notes.

Legal/company name, customer code, tax/VAT, commercial classification, billing,
credit/payment terms, quotations/pricing, contract values, account ownership and
finance fields remain read-only. Customer deletion/archival, merging, changing
legal identity and commercial/financial master data are forbidden.

The current `limitedCustomerFieldsAllowed` trusted fact is only scaffolding.
Future owning services must validate the actual changed-field allowlist, reject
protected fields and archive/merge actions, and audit permitted changes. A
client-provided boolean is never evidence of authorization. There is no customer
mutation endpoint to exercise this enforcement in the current repository.

## Project Manager

Cannot create standalone customers. Customer access requires an existing project
they manage and is limited to project-relevant operational context. The current
generic `projectUserIds` fact does not itself establish managed-project ownership
or field-level update scope. Future customer/project repositories must resolve
those facts on the server and reject customer creation. Dependent customer policy
acceptance remains pending until it can be exercised against actual relationships.

## Other decisions

Quotation approval hierarchy/thresholds and SLA values remain unconfirmed.
Warranty routing is confirmed: active warranty, otherwise active AMC, otherwise
paid service; product-specific coverage remains unconfirmed. Overrides require an
authorized user, reason, timestamp and audit. AMC frequency must be configurable
per contract. Backup/restore are required; contractual RPO/RTO remain unconfirmed.
Unknown production values do not prevent implementing configurable structures.
