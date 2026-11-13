"""Made-up Cloudflare sign-in files for the tests: the shapes a cert.pem comes in, and files that aren't one. No
real token is in any of them. CASES pairs each file with what the setup page makes of it: "ok", or which of its
sentences ("choose", "large", "not", "old"). The tunnel's own check must take exactly the files that are "ok".
"""
import base64, json

ZONE = ACCOUNT = "0" * 32
TOKEN = "local-test-only-not-a-token"
SERVICE_KEY = "v1.0-local-test-only-not-a-key"
BEGIN, END = "-----BEGIN ARGO TUNNEL TOKEN-----", "-----END ARGO TUNNEL TOKEN-----"


def pem(fields=None, raw=None, width=64, newline="\n", final=True, kind="ARGO TUNNEL TOKEN", separators=(",", ":"),
        indent=None):
    """A PEM block of base64 JSON: the fields, or raw bytes, wrapped at width characters (0 for one line)."""
    body = raw if raw is not None else json.dumps(fields, separators=separators, indent=indent).encode()
    encoded = base64.b64encode(body).decode()
    lines = [encoded[i:i + width] for i in range(0, len(encoded), width)] if width else [encoded]
    text = newline.join(["-----BEGIN " + kind + "-----"] + lines + ["-----END " + kind + "-----"])
    return (text + (newline if final else "")).encode()


def saved(account=ACCOUNT, zone=ZONE, token=TOKEN, **more):
    """As Cloudflare's page saves it in the browser: zoneID, accountID, serviceKey and apiToken."""
    return pem(dict({"zoneID": zone, "accountID": account, "serviceKey": SERVICE_KEY, "apiToken": token}, **more))


def written(account=ACCOUNT, zone=ZONE, token=TOKEN):
    """As cloudflared tunnel login writes it (EncodeOriginCert): zoneID, accountID and apiToken."""
    return pem({"zoneID": zone, "accountID": account, "apiToken": token})


def multipart(parts, boundary="----WebKitFormBoundaryLocalTestOnly"):
    """(Content-Type, body) for a form of (name, filename, bytes, extra header lines) parts, as browsers send it."""
    body = b""
    for name, filename, data, extra in parts:
        body += (b"--" + boundary.encode() + b'\r\nContent-Disposition: form-data; name="' + name.encode()
                 + b'"; filename="' + filename.encode() + b'"\r\n' + extra
                 + b"Content-Type: application/x-x509-ca-cert\r\n\r\n" + data + b"\r\n")
    return "multipart/form-data; boundary=" + boundary, body + b"--" + boundary.encode() + b"--\r\n"


FIELDS = {"zoneID": ZONE, "accountID": ACCOUNT, "serviceKey": SERVICE_KEY, "apiToken": TOKEN}
OWN = {"zoneID": ZONE, "accountID": ACCOUNT, "apiToken": TOKEN}
KEY_BLOCK = b"-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIGxvY2FsLXRlc3Qtb25seS1ub3QtYS1rZXkhIQ==\n-----END PRIVATE KEY-----\n"
CERT_BLOCK = b"-----BEGIN CERTIFICATE-----\nbG9jYWwtdGVzdC1vbmx5LW5vdC1hLWNlcnRpZmljYXRl\n-----END CERTIFICATE-----\n"


def short(token):
    """A small sign-in whose JSON is 46 bytes, so its base64 ends in == (for the padding cases)."""
    return b'{"zoneID":"a","accountID":"c","apiToken":"' + token + b'"}'


def sized(size):
    """A sign-in of exactly this many bytes, right in every other way: a long extra field, wrapped to fit."""
    base = len(json.dumps(dict(FIELDS, pad=""), separators=(",", ":")))
    guess = int((size - 66) * 64 / 65 * 3 / 4) - base
    for width in range(60, 80):
        for n in range(guess - 12, guess + 12):
            for final in (True, False):
                data = pem(dict(FIELDS, pad="p" * n), width=width, final=final)
                if len(data) == size:
                    return data
    raise AssertionError("no sign-in of %d bytes" % size)


CASES = [
    ("saved", saved(), "ok"),
    ("saved-no-final-newline", pem(FIELDS, final=False), "ok"),
    ("written-by-login", written(), "ok"),
    ("one-line", pem(FIELDS, width=0), "ok"),
    ("wrapped-at-76", pem(FIELDS, width=76), "ok"),
    ("spaced-json", pem(FIELDS, separators=(", ", ": ")), "ok"),
    ("indented-json", pem(FIELDS, indent=2), "ok"),
    ("tab-indented-json", pem(FIELDS, indent="\t"), "ok"),
    ("windows-line-breaks-in-json", pem(raw=json.dumps(FIELDS, indent=2).replace("\n", "\r\n").encode()), "ok"),
    ("json-ending-in-a-line-break", pem(raw=(json.dumps(FIELDS, separators=(",", ":")) + "\n").encode()), "ok"),
    ("spaces-around-the-object", pem(raw=b" " + json.dumps(OWN).encode() + b" "), "ok"),
    ("empty-endpoint", pem(dict(OWN, endpoint="")), "ok"),
    ("space-in-another-field", pem(dict(FIELDS, name="My zone")), "ok"),
    ("at-the-limit", sized(16384), "ok"),
    ("empty", b"", "choose"),
    ("a-byte-over-the-limit", sized(16385), "large"),
    ("far-over-the-limit", saved(pad="p" * 15000), "large"),
    ("plain-text", b"hello, this is not a sign-in\n", "not"),
    ("png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01", "not"),
    ("rsa-key", b"-----BEGIN RSA PRIVATE KEY-----\nbG9jYWwtdGVzdC1vbmx5LW5vdC1hLWtleQ==\n-----END RSA PRIVATE KEY-----\n", "not"),
    ("older-with-key-and-certificate", KEY_BLOCK + CERT_BLOCK + written(), "not"),
    ("two-token-blocks", written() + written(), "not"),
    ("windows-line-breaks", pem(FIELDS, newline="\r\n"), "not"),
    ("byte-order-mark", b"\xef\xbb\xbf" + saved(), "not"),
    ("blank-line-first", b"\n" + saved(), "not"),
    ("blank-line-last", saved() + b"\n", "not"),
    ("space-after-begin", saved().replace(BEGIN.encode() + b"\n", BEGIN.encode() + b" \n"), "not"),
    ("header-line", saved().replace(BEGIN.encode() + b"\n", BEGIN.encode() + b"\nProc-Type: 4,ENCRYPTED\n"), "not"),
    ("begin-and-end-only", (BEGIN + "\n" + END + "\n").encode(), "not"),
    ("begin-only", (BEGIN + "\n").encode(), "not"),
    ("not-json", pem(raw=b"this is not json at all"), "not"),
    ("json-list", pem(raw=b"[1, 2, 3]"), "not"),
    ("empty-object", pem(raw=b"{}"), "not"),
    ("nested-object", pem(raw=json.dumps(dict(OWN, extra={"a": "b"})).encode()), "not"),
    ("number-value", pem(raw=json.dumps(dict(OWN, n=1)).encode()), "not"),
    ("trailing-comma", pem(raw=short(b"d")[:-1] + b",}"), "not"),
    ("text-after-the-object", pem(raw=short(b"d") + b" x"), "not"),
    ("escaped-quote", pem(raw=json.dumps(dict(OWN, apiToken='a"b')).encode()), "not"),
    ("escaped-backslash", pem(raw=json.dumps(dict(OWN, other="a\\b")).encode()), "not"),
    ("unicode-escape", pem(raw=json.dumps(dict(OWN, other="é")).encode()), "not"),
    ("non-ascii", pem(raw=json.dumps(dict(OWN, other="x")).encode().replace(b'"x"', b'"\xc3\xa9"')), "not"),
    ("nul", pem(raw=short(b"d\x00")), "not"),
    ("control-character", pem(raw=short(b"d")[:-1] + b',"x":"\x01"}'), "not"),
    ("space-in-token", pem(dict(OWN, apiToken="a b")), "not"),
    ("line-break-in-token", pem(raw=short(b"ab\ncd")), "not"),
    ("no-token", pem({"zoneID": ZONE, "accountID": ACCOUNT}), "not"),
    ("no-zone", pem({"accountID": ACCOUNT, "apiToken": TOKEN}), "not"),
    ("empty-token", pem(dict(OWN, apiToken="")), "not"),
    ("names-in-another-case", pem({"ZoneId": ZONE, "AccountID": ACCOUNT, "APIToken": TOKEN}), "not"),
    ("a-name-twice", pem(raw=b'{"zoneID":"a","zoneID":"b","accountID":"c","apiToken":"d"}'), "not"),
    ("a-name-twice-in-another-case", pem(raw=b'{"zoneID":"a","ZONEID":"b","accountID":"c","apiToken":"d"}'), "not"),
    ("missing-padding", pem(raw=short(b"de")).replace(b"==\n", b"\n"), "not"),
    ("padding-bits-set", pem(raw=short(b"de")).replace(b"Q==\n", b"R==\n"), "not"),
    ("padding-in-the-middle", (BEGIN + "\n" + base64.b64encode(b'{"zoneID":"a",').decode()
                               + base64.b64encode(b'"accountID":"c","apiToken":"de"}').decode() + "\n" + END + "\n").encode(), "not"),
    ("not-base64", saved().replace(b"\n", b"\n*", 1), "not"),
    ("no-account", pem({"zoneID": ZONE, "apiToken": TOKEN}), "old"),
    ("empty-account", pem(dict(OWN, accountID="")), "old"),
]
assert len({name for name, _, _ in CASES}) == len(CASES)
