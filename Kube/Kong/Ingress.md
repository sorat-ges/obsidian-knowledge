# Kubernetes Ingress: What You Should Know

## 1. What is Ingress?
Ingress is an API object that manages external access to the services in a cluster, typically HTTP and HTTPS. In simpler terms, it acts as a "smart router" or entry point for your cluster.

Unlike a standard LoadBalancer service which gives you a single IP for a single service, **Ingress** lets you host multiple services under a single IP address, using routing rules (like URL paths or subdomains).

## 2. Ingress Resource vs. Ingress Controller
This is the most common point of confusion.
*   **Ingress Resource**: A YAML manifest where you define the *rules* (e.g., "send `api.example.com` to Service A"). This is what you write.
*   **Ingress Controller**: The actual software (pod) that *reads* your rules and implements them. Without a controller, your Ingress resources do nothing.
    *   *Examples*: Nginx, Kong, Traefik, AWS ALB Controller.

## 3. Key Capabilities

### A. Path-Based Routing (Fanout)
Route traffic based on the URL path.
*   `example.com/api` -> Service A
*   `example.com/web` -> Service B

### B. Name-Based Virtual Hosting
Route traffic based on the Host header (domain name). This allows you to host multiple websites on the same cluster/IP.
*   `foo.example.com` -> Service Foo
*   `bar.example.com` -> Service Bar

### C. TLS/SSL Termination
Ingress handles the HTTPS encryption so your internal services don't have to. You store the certificate in a Kubernetes `Secret` and reference it in the Ingress YAML.

## 4. Annotations: The "Magic Glue"
The standard Ingress spec is quite simple. To unlock advanced features (like Rate Limiting, Rewrite Targets, Authentication, etc.), you use **Annotations**.
*   These are specific to your Ingress Controller.
*   *Example (Kong)*: `konghq.com/plugins: global-rate-limit`
*   *Example (Nginx)*: `nginx.ingress.kubernetes.io/rewrite-target: /`

## 5. When to use what?

| Type | Use Case |
| :--- | :--- |
| **ClusterIP** | Internal communication only. The default. |
| **NodePort** | Quick debugging or if you don't have a LoadBalancer provider. Opens a port (30000-32767) on every node. |
| **LoadBalancer** | Exposing a single service to the internet. Expensive if you have 50 services (50 cloud IPs). |
| **Ingress** | Exposing MULTIPLE services via a single IP/LoadBalancer. The standard production choice for HTTP/S APIs and websites. |

## 6. Basic Example Structure (Kong)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: minimal-ingress
  annotations:
    # Kong-specific settings go here
    # Example: Strip the path prefix before forwarding to the backend
    konghq.com/strip-path: "true"
spec:
  ingressClassName: kong
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: my-api-service
            port:
              number: 80
```

## 7. Real-World Helm Values Example

This explains the configuration for deploying the **Kong Ingress Controller** via Helm.

```yaml
ingressController:
  enabled: true
  ingressClass: kong-customer

proxy:
  enabled: true
  annotations:
    kubernetes.io/elb.class: union
    kubernetes.io/elb.health-check-flag: "off"
    kubernetes.io/elb.id: 1374100f-fd2a-4c7b-8045-8e86ea3f4412
    kubernetes.io/elb.lb-algorithm: ROUND_ROBIN
  type: LoadBalancer
  http:
    enabled: true
    nodePort: 30181
    servicePort: 8181
  tls:
    enabled: false
  env:
    # Reduce NGINX workers (big memory saver)
    KONG_NGINX_WORKER_PROCESSES: "1"

    # Lua shared dict tuning
    KONG_NGINX_HTTP_LUA_SHARED_DICT_KONG: "64m"
    KONG_NGINX_HTTP_LUA_SHARED_DICT_KONG_DB_CACHE: "64m"
    KONG_NGINX_HTTP_LUA_SHARED_DICT_KONG_CLUSTER_EVENTS: "16m"
    KONG_NGINX_HTTP_LUA_SHARED_DICT_KONG_HEALTHCHECKS: "16m"

    # Cache tuning
    KONG_DB_CACHE_TTL: "60"
    KONG_DB_CACHE_NEGATIVE_TTL: "30"

manager:
  enabled: false # Dashboard disabled
    
admin:
  enabled: false # Admin API disabled

enterprise:
  enabled: false

env:
  database: "off"  # DB-less mode (Memory only)
  real_ip_header: "X-Forwarded-For" 
  real_ip_recursive: "on" 
  trusted_ips: "0.0.0.0/0"

resources:
  limits:
    cpu: 300m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 256Mi

replicaCount: 1

autoscaling:
  enabled: false
```

### Key Configurations Explained

*   **Custom Ingress Class (`ingressClass: kong-customer`)**:
    *   This instance of Kong will ONLY handle Ingress resources that specify `ingressClassName: kong-customer`. This allows you to run multiple Ingress Controllers (e.g., standard `kong` and this custom one) side-by-side.

*   **LoadBalancer & AWS ELB (`proxy`)**:
    *   `type: LoadBalancer`: Creates a cloud load balancer.
    *   `kubernetes.io/elb.*`: Annotations for AWS Elastic Load Balancer (ELB). It binds to a specific pre-existing ELB ID (`elb.id`) rather than creating a random new one.
    *   `tls.enabled: false`: TLS termination is disabled at the Kong Service level.

*   **Performance Optimization (`env`)**:
    *   `KONG_NGINX_WORKER_PROCESSES: "1"`: Reducing worker processes significantly reduces the memory footprint, which is ideal if you are resource-constrained or running low traffic.
    *   `LUA_SHARED_DICT_*`: Explicitly sizing the memory headers prevents Kong from claiming default large chunks of RAM.

*   **DB-less Mode (`database: "off"`)**:
    *   Kong runs without a Postgres or Cassandra database.
    *   It relies entirely on the Kubernetes API (In-Memory) for configuration.
    *   This is simpler to operate and faster to start.

*   **Resource Constraints**:
    *   The `limits` and `requests` are set quite low (256Mi - 512Mi RAM). This is safe because of the aggressive tuning of Nginx workers and Lua dictionaries above.