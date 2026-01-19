![[RateLimit.png]]

# Kong Rate Limiting

## Description
Rate limiting is a traffic management strategy used to control the rate of traffic sent or received by a network interface controller. It effectively puts a cap on how often someone can repeat an action within a certain timeframe. This is crucial for:
- Preventing DoS (Denial of Service) attacks.
- Limiting web scraping.
- Preventing cascading failures by managing load.
- Enforcing resource quotas for API consumers.

In Kubernetes with the Kong Ingress Controller, you can use the `rate-limiting` plugin. This plugin allows you to limit the number of HTTP requests a developer can make in a given period (seconds, minutes, hours, days, etc.).

## Configuration Example

You can find the raw YAML file here: [[ratelimit-example.yaml]]

To enable rate limiting, you first define a `KongPlugin` resource and then annotate your Ingress or Service to use it.

### 1. Define the KongPlugin

This example configures a limit of **5 requests per minute**.

```yaml
apiVersion: configuration.konghq.com/v1
kind: KongPlugin
metadata:
  name: global-rate-limit
  namespace: default 
config: 
  minute: 5
  limit_by: ip
  policy: local
plugin: rate-limiting
```

**Key Parameters:**
*   `minute`: The number of requests allowed per minute. You can also use `second`, `hour`, `day`, etc.
*   `limit_by`: How to aggregate the limits (e.g., `ip`, `consumer`, `credential`). `ip` is common for public endpoints.
*   `policy`: The storage backend for the counters (`local`, `cluster`, `redis`). `local` stores counters in the memory of each Kong pod (least accurate but fastest), while `redis` uses an external Redis server (most accurate for clusters).

### 2. Apply it to an Ingress

Use the `konghq.com/plugins` annotation to attach the plugin to an Ingress resource.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: demo-ingress
  namespace: default
  annotations:
    konghq.com/plugins: global-rate-limit
spec:
  ingressClassName: kong
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: echo-service
            port:
              number: 80
```