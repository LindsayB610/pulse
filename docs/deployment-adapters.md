# Deployment Adapter Contract

`pulse.deployment-adapter.v1` describes provider handoffs without making Pulse
depend on one vendor. An adapter declares its id, label, guided or compatible
support level, dashboard/docs URLs, and support for create, return, manage,
repair, update, export, and delete.

A browser-template handoff may carry only these public setup values in the URL
fragment:

- setup public key;
- suggested notification topic;
- notification-server HTTPS origin; and
- Workshop return value.

No token, credential, private key, reminder, history, account secret, or
billing detail may enter the query string, fragment, Pulse state, or public
repository. Adapter URLs must be public HTTPS pages without embedded
credentials. Pulse validates the adapter and all handoff values before opening
the provider.

Netlify is the first guided adapter. Another provider can implement the same
contract without changing Pulse’s runner engine or Workshop’s generic native
security capability.
