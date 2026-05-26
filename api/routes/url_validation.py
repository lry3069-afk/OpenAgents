"""URL validation utilities for agent endpoint verification."""
import ipaddress
import httpx
from typing import Tuple


# Private IP ranges to block (SSRF protection)
PRIVATE_IP_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # link-local
    ipaddress.ip_network("0.0.0.0/8"),  # current network
    # IPv6
    ipaddress.ip_network("::1/128"),  # loopback
    ipaddress.ip_network("fc00::/7"),  # unique local
    ipaddress.ip_network("fe80::/10"),  # link-local
    ipaddress.ip_network("ff00::/8"),  # multicast
]


def is_private_ip(ip_str: str) -> bool:
    """Check if an IP address is private/internal."""
    try:
        ip = ipaddress.ip_address(ip_str)
        for network in PRIVATE_IP_RANGES:
            if ip in network:
                return True
        return False
    except ValueError:
        return True  # Treat invalid IPs as blocked


def validate_endpoint_not_private(host: str) -> Tuple[bool, str]:
    """
    Check if the hostname resolves to a private IP.
    Returns (is_safe, message).
    """
    import socket

    try:
        addrs = socket.getaddrinfo(host, None)
        for family, _, _, _, sockaddr in addrs:
            ip_str = sockaddr[0]
            if is_private_ip(ip_str):
                return False, f"Private/internal IP blocked: {ip_str}"
        return True, ""
    except socket.gaierror:
        return False, f"Cannot resolve hostname: {host}"


async def validate_endpoint(url: str, timeout: float = 5.0) -> Tuple[bool, str]:
    """
    Validate an agent endpoint URL.

    Checks:
    1. Valid http/https URL format
    2. Not a private/internal IP after DNS resolution (SSRF protection)
    3. URL is reachable via HEAD request

    Returns (is_valid, error_message).
    """
    from pydantic import HttpUrl, ValidationError
    from pydantic import __version__ as pydantic_version

    # Parse URL and validate scheme
    try:
        # Use pydantic HttpUrl for strict validation
        from pydantic import HttpUrl

        parsed = HttpUrl(url=url)
        if parsed.scheme not in ("http", "https"):
            return False, "URL must use http or https scheme"
        host = parsed.host
        if not host:
            return False, "URL must have a valid host"
    except ValidationError as e:
        return False, f"Invalid URL format: {e}"

    # SSRF check: resolve hostname and block private IPs
    is_safe, msg = validate_endpoint_not_private(host)
    if not is_safe:
        return False, msg

    # HEAD request reachability check
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout)) as client:
            response = await client.head(url, follow_redirects=True)
            # Accept 2xx, 3xx as reachable
            if response.status_code >= 400 and response.status_code not in (405,):
                # 405 Method Not Allowed for HEAD — some servers don't support it
                return False, f"Endpoint returned HTTP {response.status_code}"
            return True, ""
    except httpx.TimeoutException:
        return False, f"Endpoint did not respond within {timeout}s"
    except Exception as e:
        return False, f"Could not reach endpoint: {e}"
