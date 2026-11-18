"""Renders every state of the setup page with mocked settings, Tailscale and checks, to catch errors
before a real run. A mocked test: nothing runs but the page's own code. Then the live page's checks card in
each state, and every connecting stage of the three options through the page's own checks, with the network
mocked."""
import html, importlib.machinery, importlib.util, itertools, json, os, re, tempfile, time
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../umbrel/setup-page/setup.py")
loader = importlib.machinery.SourceFileLoader("s", PAGE)
m = importlib.util.module_from_spec(importlib.util.spec_from_loader("s", loader)); loader.exec_module(m)
CHECK = m.check
OWNER = "npub1464m3lr8zsjm79l073tcrptr8ekddatt30p8q4f25zcc7dq0zc7sc9a4yn"


def use(d):
    """The page's folders, all in d."""
    m.SETTINGS_DIR = m.TAILSCALE_DIR = m.CLOUDFLARE_DIR = d
    m.RELAY_ENV, m.SETUP_JSON = d + "/relay.env", d + "/setup.json"
    m.TAILSCALE_ON, m.TAILSCALE_STATUS, m.TAILSCALE_SERVE = d + "/ts-on", d + "/ts.json", d + "/ts.txt"
    m.CLOUDFLARE_ON, m.CLOUDFLARE_STATE, m.CLOUDFLARE_LOGIN, m.CLOUDFLARE_SETUP, m.CLOUDFLARE_RESET = (
        d + "/cf-on", d + "/cf-state", d + "/cf-login.log", d + "/cf-setup.log", d + "/cf-reset")
    m.CLOUDFLARE_UPLOAD = d + "/cf-upload.pem"


# The live page's next steps, as a guide: its steps (each link's title and line, the kicker and the heading), their
# drawings in order with what each shows, and what the captions keep from the longer texts they replaced
GUIDE_STEPS = (("join", "Join your community", "First, as the owner", "Step 1 of 4", "Join your community"),
               ("invite", "Invite people", "With an invite link", "Step 2 of 4", "Invite people"),
               ("safe", "Keep it safe", "Agents and open communities", "Step 3 of 4", "Keep your community safe"),
               ("phone", "Pair your phone", "Optional", "Step 4 of 4 &middot; Optional", "Pair your phone"))
GUIDE_FRAMES = {"join": (("Open Join a community", '<p class="on">', "If Buzz opens on a <b>Join a community</b> page instead"),
                         ("Paste the address", "<h6>Community URL</h6>", "choose <b>Continue</b> twice")),
                "invite": (("Open Membership", '<span class="hot">Invite</span>', "choose <b>Membership</b>, then the <b>Invite</b> tab."),
                           ("Send an invite link", '<span class="mb-copy hot">Copy link</span>',
                            "Anyone with the link can join until it expires or runs out of uses.")),
                "safe": (("Give each agent its own machine", '<svg class="sq-iso sq-wide" viewBox="0 0 560 204" role="img"',
                          "run agents on a separate computer with nothing private on it"),
                         ("Treat an open community as public", '<ul role="list" aria-labelledby="sq-share">',
                          "Keep private work, personal details and passwords out.")),
                "phone": (("Scan the code", "Copy pairing code", "choose <b>Add Community</b> in its community switcher"),
                          ("Check the code", 'dark hot">Codes match</span>', "type the six digits your computer shows"))}
# The safety step's texts as the owner approved them, word for word, and the variants: the private network isn't on the
# internet, moderation on lets the owner and staff read private messages, and only the owner's own domain can ban
SAFE_INTRO = ("Opening your community to the internet exposes you to risk. So does adding agents with access to personal "
              "data. Here are some tips to keep yourself and your community safe.")
SAFE_INTRO_PRIVATE = ("Adding agents with access to personal data exposes you to risk. Here are some tips to keep yourself "
                      "and your community safe.")
AGENT_CAPTION = ("Agents made in Buzz can run on their owner's computer. If that computer holds private data, the agent may "
                 "be able to reach it. Agents take instructions only from their owner, but they read channel history to do "
                 "their work, and any text they read can be written to trick them. The risk is higher when anyone can "
                 "join. In an open community, run agents on a separate computer with nothing private on it, and don't "
                 'connect them to your email, drives or code. <a href="https://self-host.buzz/#agents" target="_blank" '
                 'rel="noopener">The self-hosting guide</a> shows how to run an agent on its own server.')
OPEN_CAPTION = ("If anyone can join, strangers can post, and members can bring their own agents without asking you. Anyone "
                "who joins, and any agent they bring, can read every channel that isn't private, including its full "
                "history. They can also open files shared there and see who's a member. Keep private work, personal "
                "details and passwords out.")
PRIVATE_NOTE = ("Anyone in a private channel can add people and agents to it, so keep these channels to people you trust. "
                "Shared files are different: anyone in the community with a file's link can open it.")
# Members read the notes too, so the moderated one names the owner, not "you"
MODERATED_NOTE = ("While Moderation is on, the owner and the staff they add can open any message stored here by its ID, "
                  "deleted ones included, even in private channels and direct messages. " + PRIVATE_NOTE)
INVITE_NOTE = ("A new link works for 3 days with no limit on uses unless you change it, and for 30 days at most. You can't "
               "cancel a link yet, and someone you remove can rejoin with a link that still works.")
BAN_NOTES = {False: "To keep an identity out, turn on Moderation in Settings, then ban it in Buzz on a computer. The same "
                    "person can still join under a new identity.",
             True: "To keep an identity out, ban it in Moderation in Buzz on a computer. The same person can still join "
                   "under a new identity."}
SHARE = ('<p class="muted small">Share these with your members. <a href="https://self-host.buzz/#security" target="_blank" '
         'rel="noopener">More on security in the self-hosting guide</a></p>')
NOTE = re.compile(r'<li><span class="g-ni">(<svg class="tb-i" viewBox="0 0 24 24" aria-hidden="true">.*?</svg>)</span>'
                  r'<p><b>([^<]*)</b> (.*?)</p></li>')
# What the drawing of the agent says to screen readers, wide or tall, and its labels: under the wide drawing its three
# parts, under the tall one its two. The words drawn in each, in order: the line nothing crosses on the wide one, then
# the Buzz window, where Ops answers the same in both.
SAY_AGENT = ("Your computer, with your files, keys and logins, set apart by a dotted line that nothing crosses. Beside it, a "
             "Buzz window: Maya asks the agent Ops to draft the notes, and Ops answers. A line runs from the agent's message to "
             "a small machine on a yellow floor, where the agent runs with one project.")
WIDE_LABELS = [("Your computer", "your files, keys, logins"), ("Your community", "the agent sees what is posted"),
               ("The agent's machine", "one project only")]
TALL_LABELS = [("The agent's machine", "one project only"), ("Your computer", "your files, keys, logins")]


def window(ask):
    return ["release", "Open community", "Maya", "10:02 AM", "Ops", ask, "Ops", "10:03 AM", "On it."]


WINDOW_TEXTS = {"wide": ["no way across"] + window("draft the notes?"), "tall": window("can you draft the notes?")}
# Settings, Moderation: who can read private messages, which the safety step's Private channels note says while it's on
SHARE_LIVE = ('Buzz doesn\'t tell members, so tell them. While it\'s on, the Private channels note in <a href="#safe">'
              'Keep it safe</a> says so.')
SHARE_LATER = ("Buzz doesn't tell members, so tell them. Once your community is live, the Private channels note in the "
               "Keep it safe step says so while it's on.")
# texts the reviews replaced: "you" in a note members read, the line to share it, and a reply about the code the caption
# says to keep from agents
REPLACED = ("you and staff you add can open", "says it, so share it", "Working from the app repo")
# The invite caption says how to invite one person, as Buzz has no Add directly since 1.0.1; the pairing caption has
# both ways the phone checks the code, the protect prompt's three buttons and Skip, and then, on the computer, Codes match
INVITE_ONE = "To invite one person, set <b>Max uses</b> to <b>1 use</b> first."
# Buzz's Membership since 1.0.1: a Members and an Invite tab, the Invite tab to click first, then on it Copy link beside
# the link's QR code, with its expiry and its use limit under it
MEMBERS_TABS = '<p class="mb-tabs"><span class="on">Members</span><span class="hot">Invite</span></p>'
INVITE_TABS = '<p class="mb-tabs"><span>Members</span><span class="on">Invite</span></p>'
INVITE_PANEL = ('<div class="mb-inv"><div class="mb-inv-qr"><svg class="id-qr"', "Copy link</span></span></div>"
                '<div class="mb-group"><p>Expires after<span class="mb-choice">3 days', '<p>Max uses<span class="mb-choice">No limit')
# The app dock as a new install has it since 1.0.1: Bestie first, with the default page icon, then Messages and Agents.
# A page without that icon fails the checks below rather than stopping here.
DOCK = ('<div class="mb-dock"><span class="mb-tile">' + (m.ti("browser") if "browser" in m.TABLER else "no browser icon")
        + '</span><span class="mb-tile on">' + m.ti("messages") + '</span><span class="mb-tile">' + m.ti("robot") + "</span>")
# The owner step and the private network's next steps: members join with an invite link, no longer added by public ID
OWNER_INVITES = "As the owner, you invite the other members and choose admins in Buzz."
PRIVATE_INVITE = "share the <b>buzz</b> machine with them, then send them an invite link from Buzz."
PAIRING = ("If the phone asks for a code, type the six digits your computer shows. If it shows a code, check that the digits "
           "match. When it asks to protect your identity, choose <b>Use Face ID</b>, <b>Use Touch ID</b> or <b>Use "
           "biometrics</b>, or <b>Skip</b>. Then choose <b>Codes match</b> on your computer.")
OPEN_NOTE = '<p class="muted small">Opens Buzz on this computer with the address filled in, once Buzz is set up.</p>'
SAID = '<p class="vh" role="status" data-said></p>'
GUIDE_LINK = ('<a class="g-out" href="https://self-host.buzz/" target="_blank" rel="noopener">')
OWN_KEY = ('Made your own key? <a href="https://self-host.buzz/" target="_blank" rel="noopener">The self-hosting guide</a> '
           "shows how to join with it.")
BUILDERLAB = '<details class="g-more"><summary>Signed in with Builderlab?</summary>'
NOTIFY_ON = "iPhones get notifications for direct messages and mentions. Android phones don't yet."
NOTIFY_OFF = "Phone notifications are off. You can turn them on in Settings, further down this page."
# texts the guide dropped, or the old next steps had, and the safety tips the safety step replaced
GONE = ("Bought the domain recently?", "Show me how", "Join as you set up Buzz", "Phone notifications are on for iPhone",
        "<h2>Add members</h2>", "You can turn them on in Settings.</p>", "choose <b>Use Face ID</b> or <b>Skip</b>",
        "Keeping your community safe", "Most of this is common sense", "Block is working on more protections for agents",
        "The safety tips on this page", "Agents work with what's on their computer.", "Private channels and direct messages "
        "are for the people in them", "but moderation can read them", "Invite links decide which people get in.",
        "Step 1 of 3", "Step 3 of 3",
        # Buzz 1.0.0's Membership: its Invite members button and dialog, Add directly, and the captions that named them
        "Invite members", "in newer versions of Buzz", "Add or invite people", "Add directly", "Add member",
        "Refresh</span>", "public ID under", "In Buzz 1.0.0",
        # the Moderation row's panels and the Builderlab fold's old claim
        "While it's on:</p><ul>", "Your community won't appear there by itself")
# the app's own Cloudflare tunnel, from waiting for a sign-in to running, and its errors; signin+upload is
# a sign-in the owner uploaded, waiting for the tunnel to take it
CLOUDFLARE = ("", "signin", "signin+upload", "creating", "routing", "taken", "wrong-domain", "error", "running")
UPLOAD_FORM = 'action="cloudflare-upload"'
UPLOAD_OPEN = '<details class="alt" open><summary>Cloudflare saved a file named cert.pem instead?</summary>'
# Moderation as setup.json can hold it: never turned on (no key), on, and turned off again. A Tailscale option
# stores it off whatever is asked, so it has no "on".
MODERATION = (None, True, False)
TICKED, UNTICKED = 'name="moderation" value="on" checked>', 'name="moderation" value="on">'
POINTS = "A ban keeps one identity out, with the agents that join through it."
MESSAGES = ("<b>Could not check access.</b>", "<b>Access is unavailable in this build or on this relay.</b>",
            "<b>Select a community on a relay where you have staff access.</b>")
OWNER_STAFF = "Staff added in Moderation stay staff after the change, whenever Moderation is on."
OWNER_REVIEW = "The new owner can review the staff in Buzz under Moderation, then Staff."
OWNER_LOSES = "You lose Moderation after the change, unless the new owner adds you as staff"
# Buzz's reason shows only as its button's tooltip, and its third message also comes from Cloudflare or a lost port
WHERE = "If Moderation says Unavailable, point at its button to see why:"
NOT_ONLY = "If this page shows a moderation problem, fix that first."
OPERATORS_STAY = "Staff with the operator role can still rename public channels while it's off"
ADDRESS_LINES = ('data-for="domain">Moderation stays on, at the new address.',
                 'data-for="funnel private">Moderation turns off: it needs your own domain.')
MODERATION_OPEN = '<details open><summary>Moderation<span class="val word">'


def section(page, start, end):
    return page[page.index(start):page.index(end, page.index(start))]


def check_safe(page, pane, mode, moderation):
    """The safety step: its intro, its two drawings with what they say to screen readers, the pictures in them drawn once,
    and its notes for each option and moderation state, then the line to share them, with the guide's Security section."""
    on = moderation is True and mode == "domain"
    assert pane.startswith('<p class="eyebrow">Step 3 of 4</p><h2 tabindex="-1">Keep your community safe</h2><p class="muted">'
                           + (SAFE_INTRO_PRIVATE if mode == "private" else SAFE_INTRO) + '</p><svg class="sq-defs" aria-hidden="true">')
    # The people and the agent, each drawn once on the page and used where they show, with no <img> anywhere: Maya twice
    # in each drawing of the window and once in the open community, Leo once in each, the agent twice in each
    assert page.count('<svg class="sq-defs"') == 1 and page.count("<symbol ") == 3 and page.count("data:image/webp;base64,") == 1
    assert all(page.count('<symbol id="sq-' + name + '"') == 1 for name in ("maya", "leo", "ops")) and "<img" not in page
    assert [page.count('href="#sq-' + name + '"') for name in ("maya", "leo", "ops")] == [5, 3, 4]
    assert page.count('id="sq-round"') == 1 and page.count('clip-path="url(#sq-round)"') == 2
    drawings, foot = pane[:pane.index('<div class="g-foot">')], pane[pane.index('<div class="g-foot">'):]
    agent, public = drawings.split('<div class="g-frame" ')[1:]
    # What an agent can touch: a picture with its description, wide and tall, and the labels under each kept from screen
    # readers, since the description says them. The tall one's are the page's text too, not drawn in, so they wrap
    # when a reader spaces text out; its drawing stops where they start.
    say = 'role="img" aria-label="' + html.escape(SAY_AGENT) + '"'
    assert agent.count(say) == 2 and '<svg class="sq-iso sq-wide" viewBox="0 0 560 204" ' + say in agent
    assert '<svg class="sq-iso sq-tall" viewBox="0 0 340 311" ' + say in agent
    assert '<p class="sq-k"><i></i>What the agent can touch</p><span class="sq-rec">Recommended</span>' in agent
    svgs = {kind: svg for svg, kind in re.findall(r'(<svg class="sq-iso sq-(wide|tall)" .*?</svg>)', agent)}
    assert {key: re.findall(r">([^<>]+)<", svg) for key, svg in svgs.items()} == WINDOW_TEXTS, svgs.keys()
    caps = re.findall(r'<div class="(sq-caps(?: sq-caps-tall)?)" aria-hidden="true">(.*?)</div>', agent)
    assert [(kind, re.findall(r"<p><b>([^<]*)</b><span>([^<]*)</span></p>", body)) for kind, body in caps] == [
        ("sq-caps", WIDE_LABELS), ("sq-caps sq-caps-tall", TALL_LABELS)], caps
    assert agent.endswith('<p class="muted small g-cap">' + AGENT_CAPTION + "</p></div>")
    # What anyone who joins can read: two lists, each named by its heading, and a list in Safari too
    lists = re.findall(r'<p class="sq-h" id="([\w-]+)">([^<]*)</p><ul role="list" aria-labelledby="([\w-]+)">(.*?)</ul>', public)
    assert [(label, heading, named == label) for label, heading, named, _ in lists] == [
        ("sq-share", "Fine to share", True), ("sq-keep", "Keep out", True)]
    assert [re.findall(r"</span>([^<]+)</li>", items) for _, _, _, items in lists] == [
        ["Public docs", "Open-source code", "Announcements"], ["Customer data", "Private repositories", "Keys and logins"]]
    assert page.count('id="sq-share"') == page.count('id="sq-keep"') == 1
    assert '<span class="sq-name"><b>Open community</b><i>anyone can join</i></span>' in public
    assert public.endswith('<p class="muted small g-cap">' + OPEN_CAPTION + "</p></div></div>")
    # The notes: who can read private messages leads while moderation is on, and bans only on the owner's own domain
    notes = [("lock", "Private channels.", MODERATED_NOTE if on else PRIVATE_NOTE), ("link", "Invite links.", INVITE_NOTE)]
    if mode == "domain":
        notes.append(("ban", "Bans.", BAN_NOTES[on]))
    assert NOTE.findall(foot) == [(m.ti(icon), lead, text) for icon, lead, text in notes], (mode, moderation)
    assert foot.startswith('<div class="g-foot"><ul class="g-notes" role="list"><li>') and foot.endswith("</li></ul>" + SHARE + "</div>")


def check_own(page):
    """The page loads nothing from another host: no src= that names one, no stylesheet or @import, every url() one of its
    own #ids, and in its SVGs every href one of its own #ids or the agent's picture, written into the page."""
    sources = re.findall(r"""\ssrc\s*=\s*["']?([^"'\s>]*)""", page, re.I)
    assert not [s for s in sources if re.match(r"([a-z][a-z0-9+.-]*:|//)", s, re.I)], sources
    assert "<link" not in page.lower() and "@import" not in page.lower()
    urls = re.findall(r"url\(\s*['\"]?([^)'\"]*)", page, re.I)
    assert urls and all(url.startswith("#") for url in urls), urls
    hrefs = [href for svg in re.findall(r"<svg\b.*?</svg>", page, re.S | re.I)
             for href in re.findall(r"""[\s:]href\s*=\s*["']?([^"'\s>]*)""", svg, re.I)]
    assert hrefs and all(href.startswith(("#", "data:image/webp;base64,")) for href in hrefs), [h[:40] for h in hrefs]


def check_guide(page, mode, domain, push, moderation):
    """The live page's guide: four steps in order, each with two drawings, a stepper and its own notes. Returns the
    number of steps and drawings checked."""
    check_own(page)
    guide = section(page, '<section class="next">', 'aria-live="polite"></p></div></section>')
    nav = section(guide, '<nav class="g-nav" aria-label="Next steps">', "</nav>")
    # the steps, in order, as links that work without scripts; none is current until the script picks one
    links = re.findall(r'<a class="g-step" href="#(\w+)">.*?<b>(.*?)</b><small>(.*?)</small>', nav)
    assert links == [(key, title, sub) for key, title, sub, _, _ in GUIDE_STEPS], links
    assert "aria-current" not in guide
    # Go further: the guide's homepage alone, in a new tab
    assert nav.count("self-host.buzz") == 1 and GUIDE_LINK in nav and ">Go further</p>" in nav
    assert "<b>The self-hosting guide</b><small>Roles, moderation, backups and agents</small>" in nav
    # the self-hosting guide's homepage from Go further and the own-key line, and its Security section from the safety step
    assert re.findall(r'href="https://self-host\.buzz[^"]*"', guide) == ['href="https://self-host.buzz/"'] * 2 + [
        'href="https://self-host.buzz/#agents"', 'href="https://self-host.buzz/#security"']
    # each pane runs to its last </section>: Buzz's drawn screens have sections of their own
    parts = guide.split('<section class="g-pane" id="')[1:]
    panes = [(part[:part.index('"')], part[part.index('">') + 2:part.rindex("</section>")]) for part in parts]
    assert [key for key, _ in panes] == ["join", "invite", "safe", "phone"]
    checked = 0
    for (key, pane), (_, _, _, kicker, heading) in zip(panes, GUIDE_STEPS):
        # the heading takes focus when its link opens the step
        assert pane.startswith('<p class="eyebrow">' + kicker + '</p><h2 tabindex="-1">' + heading + "</h2>"), key
        frames = pane.split('<div class="g-frame" ')[1:]
        assert len(frames) == 2, key
        for n, (frame, (name, drawn, kept)) in enumerate(zip(frames, GUIDE_FRAMES[key]), 1):
            assert '<span class="g-n" aria-hidden="true">0%d / 02</span>' % n in frame and '<span class="g-t">' + name + "</span>" in frame
            assert '<span class="vh">Part %d of 2: </span>' % n in frame
            assert drawn in frame and kept in frame, (key, n, drawn, kept)
            # crossing into a drawing says the step's heading and the drawing's title
            assert 'data-say="' + html.escape(heading + ", part %d of 2: " % n + name) + '"' in frame
            # Buzz's screens are pictures alone, which the captions say in words; the safety step's drawings say what
            # they show themselves, so nothing hides them from screen readers
            assert ('<div class="mb" aria-hidden="true">' in frame) == (key != "safe") and ("sq-fig" in frame) == (key == "safe")
            # the stepper's buttons, with names, stopped only at the guide's ends
            assert 'data-go="-1" aria-label="Previous"' in frame and 'data-go="1" aria-label="Next"' in frame
            assert ('data-go="-1" aria-label="Previous" aria-disabled="true"' in frame) == (key == "join" and n == 1)
            assert ('data-go="1" aria-label="Next" aria-disabled="true"' in frame) == (key == "phone" and n == 2)
            checked += 1
        checked += 1
    check_safe(page, dict(panes)["safe"], mode, moderation)
    join, invite, _, phone = (pane for _, pane in panes)
    # Join: the address to open or copy, kept in a data attribute, what Open in Buzz does under them, and the own-key line
    assert ('<a class="btn" href="buzz://connect?relay=wss%3A%2F%2F' + domain + '">Open in Buzz</a>') in join
    assert ('<button class="btn ghost" type="button" data-copy="https://' + domain + '" onclick="copyText(this, '
            'this.dataset.copy)">Copy the address</button></div>' + OPEN_NOTE + '<div class="g-frames">') in join
    assert page.count(OPEN_NOTE) == 1
    assert INVITE_ONE in invite.split('<div class="g-frame" ')[2] and PAIRING in phone.split('<div class="g-frame" ')[2]
    assert OWN_KEY in join and join.count("self-host.buzz") == 1
    # Join's drawings show the dock as a new install has it; Invite's, Membership's two tabs, then the Invite tab
    assert join.count(DOCK) == 2 and invite.count(DOCK) == 0
    members, sharing = invite.split('<div class="g-frame" ')[1:]
    assert MEMBERS_TABS in members and INVITE_TABS not in members and "mb-inv" not in members
    assert "Search members</p>" in members and "<small>Owner · You</small>" in members
    assert INVITE_TABS in sharing and MEMBERS_TABS not in sharing and all(part in sharing for part in INVITE_PANEL)
    assert "Search members" not in sharing and members.count('hot"') == sharing.count('hot"') == 1
    # Invite: who can connect, on the private network alone
    assert (m.private_members_note() in invite) == (mode == "private") and m.private_members_note() not in join + phone
    # Phone: the stores, Tailscale on the private network, Builderlab under the first drawing, notifications last
    assert m.APP_STORE in phone and m.GOOGLE_PLAY in phone
    assert ("The phone needs Tailscale too." in phone) == (mode == "private")
    first, second = phone.split('<div class="g-frame" ')[1:]
    assert BUILDERLAB in first and BUILDERLAB not in second and "<code>https://" + domain + "</code>" in first
    assert "Get Buzz on your phone" in first and "<b>or sign in with email</b>" in first and "<b>Enter a community link</b>" in first
    assert phone.endswith('<div class="g-foot"><p class="note">' + (NOTIFY_ON if push else NOTIFY_OFF) + "</p></div>")
    assert page.count(NOTIFY_ON if push else NOTIFY_OFF) == 1 and (NOTIFY_OFF if push else NOTIFY_ON) not in page
    assert not any(gone in page for gone in GONE), [gone for gone in GONE if gone in page]
    return checked



# The guide's look, from the stylesheet: about 1000px wide on a computer, stacked below 880px, 44px stepper buttons
style = m.STYLE + m.HOW_STYLE + m.SAFE_STYLE
assert "min(1000px, 100vw)" in section(style, ".next {", "}") and "@media (min-width: 880px) { .guide { grid-template-columns: 250px" in style
assert "width: 44px; height: 44px;" in section(style, ".g-btns button {", "}")


def contrast(alpha, background=(255, 255, 255)):
    """The page's ink at this opacity, over a background, against that background (WCAG 2)."""
    def luminance(rgb):
        return sum(w * (c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
                   for w, c in zip((0.2126, 0.7152, 0.0722), (v / 255 for v in rgb)))
    ink = tuple(i * alpha + b * (1 - alpha) for i, b in zip((35, 30, 30), background))
    return (luminance(background) + 0.05) / (luminance(ink) + 0.05)


# Small text in --ink-2, at least 4.5:1 on the page's white and its two greys; --ink-3 at least 3:1, and only for marks
# that aren't text and for an option that can't be chosen
inks = dict(re.findall(r"--(ink-[23]): rgb\(35 30 30 / (\d+)%\)", style))
for name, least in (("ink-2", 4.5), ("ink-3", 3)):
    assert all(contrast(int(inks[name]) / 100, bg) >= least for bg in ((255, 255, 255), (0xf7, 0xf7, 0xf4), (0xf2, 0xf2, 0xee))), name
assert sorted(sel.strip() for sel, body in re.findall(r"([^{}]+)\{([^{}]*)\}", style) if "var(--ink-3)" in body) == [
    ".bar .work .tr", ".opt:has(input:disabled) :is(b, small)", ".set-card details > summary::after", ".sq .sq-new"]
# The safety drawings' rules: every one inside .sq, where they are, but the hidden symbols' own; the page's colors, none
# of their own; the tall drawing below 480 pixels of the drawing's width, as the guide has it on a phone, with its
# labels, near its own width at most; and at least as tall as Buzz's screens, which are 340 pixels at 560 wide and scale
# down with the width. Narrower, both drawings get the tall one's height with its labels (348 for 340 wide, and the
# rest of the box), and no less than the lists need on the smallest phones, so the stepper stays put between them.
safe = re.sub(r"@container sq \([^)]*\) \{|\n\}", "", m.SAFE_STYLE)
loose = [sel.strip() for sel, _ in re.findall(r"([^{}]+)\{([^{}]*)\}", safe) if sel.strip() != ".sq-defs"
         and not all(part.strip().startswith(".sq ") or part.strip() == ".sq" for part in sel.split(","))]
assert safe.count("{") > 80 and not loose, loose
tokens = set(re.findall(r"--([\w-]+):", m.STYLE.split("}")[0]))
assert not re.search(r"--[\w-]+:", m.SAFE_STYLE) and set(re.findall(r"var\(--([\w-]+)\)", m.SAFE_STYLE)) <= tokens
assert ("@container sq (max-width: 479px) {\n  .sq .sq-fig { min-height: calc(min(100cqw - 32px, 360px) * 348 / 340 + 84px); }\n"
        "  .sq .sq-wide, .sq .sq-caps { display: none; }\n  .sq .sq-tall { display: block; }\n"
        "  .sq .sq-caps-tall { display: grid; }") in m.SAFE_STYLE
assert ("@container sq (max-width: 360px) {\n  .sq .sq-fig { min-height: max(360px, calc((100cqw - 20px) * 348 / 340 + 80px)); "
        "padding: 14px 10px 16px; }\n  .sq .sq-caps-tall { font-size: calc((100cqw - 20px) * 14 / 340); }") in m.SAFE_STYLE
assert "min-height: max(306px, min(340px, 100cqw * 340 / 560));" in section(m.SAFE_STYLE, ".sq .sq-fig {", "}")
assert ".sq .sq-tall { display: none; max-width: 360px; margin-inline: auto; }" in m.SAFE_STYLE
# the tall drawing's labels at its scale, each centered under its part (x 84 and 254 of 340)
assert ("grid-template-columns: minmax(0, 168fr) minmax(0, 172fr); gap: 0; max-width: 360px; margin-inline: auto; "
        "padding-top: 0.143em; font-size: calc(min(100cqw - 32px, 360px) * 14 / 340);") in section(m.SAFE_STYLE, ".sq .sq-caps-tall {", "}")
assert "height: calc(340px * var(--s));" in section(style, ".mb-stage {", "}")
# The stepper's count, title and buttons line up on the title's first line, so buttons don't move with a title that wraps
assert ".js .g-row { align-items: flex-start; }\n.js .g-n { display: flex; align-items: center; min-height: 44px; }\n.js .g-t { padding-top: 10px; }" in style
assert ".next + details.alt" not in style
# A focus ring the card's rounded edge doesn't clip, a count that stays whole, a faded icon but not its button's ring,
# the problem mark's "!" kept from screen readers, copy buttons only with scripts, and the current step in forced colors
assert ".set-card summary:focus-visible { outline-offset: -3px; border-radius: 12px; }" in style
assert ".ck-all > summary .val { flex: none; }" in style
assert "opacity" not in section(style, '.g-btns button[aria-disabled="true"] {', "}")
assert '.g-btns button[aria-disabled="true"] .tb-i { opacity: 0.35; }' in style
assert style.count('content: "!"; content: "!" / "";') == 2 and style.count('content: "!"') == 4
assert "html:not(.js) [data-copy] { display: none !important; }" in style
assert "@media (forced-colors: active) { .g-nav a[aria-current] { border: 2px solid CanvasText;" in style
assert "@media (forced-colors: active) { .sq .sq-fig { forced-color-adjust: none; } }" in style

count = 0
for mode in ("domain", "funnel", "private"):
    for named in (True, False):
        for live in (True, False):
            states = ("",) if mode == "domain" else ("NeedsLogin", "NeedsMachineAuth", "Running", "")
            for state, push, cf, moderation in itertools.product(states, (True, False), CLOUDFLARE if mode == "domain" else ("",),
                                                                 MODERATION if mode == "domain" else (None, False)):
                use(tempfile.mkdtemp())
                domain = ("buzz.example.com" if mode == "domain" else "buzz.tail1234.ts.net") if named else ""
                if mode == "domain" and not named:
                    continue
                m.save(OWNER, m.owner_hex(OWNER), mode, domain, push, moderation)
                if cf:
                    open(m.CLOUDFLARE_STATE, "w").write(cf.split("+")[0] + "\n")
                    open(m.CLOUDFLARE_LOGIN, "w").write("https://dash.cloudflare.com/argotunnel?aud=&callback=x\n")
                    open(m.CLOUDFLARE_SETUP, "w").write("2026-10-28T00:00:00Z ERR Failed to add route: <reason>\n")
                    if cf.endswith("+upload"):
                        open(m.CLOUDFLARE_UPLOAD, "w").write("a sign-in the owner uploaded\n")
                json.dump({"BackendState": state, "AuthURL": "https://login.tailscale.com/a/x", "Self": {"DNSName": domain + ".", "ID": "n1"}}, open(m.TAILSCALE_STATUS, "w"))
                m.CACHE["key"] = None
                m.check = (lambda lv: (lambda setup, page_load=False: (lv, [m.item("relay", "ok", "x"), m.item("device", "wait", "y")])))(live)
                setup = m.load_setup()
                on = moderation is True and mode == "domain"
                assert m.moderation_on(setup) == on and ("BUZZ_ADMIN_HOST=buzz.example.com:8443" in m.read_text(m.RELAY_ENV)) == on
                forms = ({}, {"form": "owner", "owner": "bad"}, {"form": "address", "mode": "funnel"}, {"form": "moderation"})
                for values in forms + (({"form": "cert"},) if mode == "domain" else ()):
                    page = m.main_page(setup, "an error" if values else "", values)
                    assert "<main>" in page and "Traceback" not in page
                    # the safety drawings' rules only on the page with the step, and none of the texts the reviews replaced
                    assert (m.SAFE_STYLE in page) == live and not [old for old in REPLACED if old in page]
                    assert ((NOTIFY_ON if push else NOTIFY_OFF) in page) == live
                    assert ('href="buzz://connect?relay=wss%3A%2F%2F' + domain + '"') in page or not (live and named)
                    # Live: the checks as a card, then the next steps as a guide. Connecting: the checks as a bar.
                    assert ('<div class="set-card ck-card' in page) == live and ('<ol class="bar"' in page) == (not live)
                    assert ('<section class="next">' in page) == live and page.count('<div class="checks" data-poll data-phase="') == 1
                    if live and named and not values:
                        count += check_guide(page, mode, domain, push, moderation)
                    # The upload, only while the tunnel waits for a sign-in and none was uploaded yet
                    if live or cf != "signin":
                        assert UPLOAD_FORM not in page, (mode, live, cf)
                    else:
                        assert UPLOAD_FORM in page and 'enctype="multipart/form-data"' in page and "My Profile, API Tokens" in page
                        assert "Sign in to Cloudflare</a>" in page
                        if values.get("form") == "cert":
                            box = page[page.index(UPLOAD_OPEN):]
                            assert box.index('role="alert">an error') < box.index("</details>"), "the error is inside the upload"
                        else:
                            assert UPLOAD_OPEN not in page
                    if not live and cf == "signin+upload":
                        assert "Signed in with your file" in page and "Sign in to Cloudflare</a>" not in page
                        assert "My Profile, API Tokens" in page
                    # Settings, Moderation: offered on the owner's own domain once live, and turned off from anywhere
                    row = section(page, "<summary>Moderation", "<summary>Address")
                    if mode != "domain":
                        assert "Own domain only" in row and "Buzz won't connect to it at a Tailscale address" in row
                        assert 'name="moderation"' not in row, (mode, moderation)
                    elif on:
                        assert TICKED in row and POINTS in row and m.STAFF_RETURN not in row
                        if live:
                            assert "Moderation doesn't show in Buzz?" in row and all(t in row for t in MESSAGES)
                            assert WHERE in row and NOT_ONLY in row
                            assert "Bans, timeouts and staff stay as they are." in row and OPERATORS_STAY in row
                        else:
                            assert "It starts working once your community is live." in row and MESSAGES[0] not in row
                    elif live:
                        assert UNTICKED in row and POINTS in row and "Moderation doesn't show in Buzz?" not in row
                        assert "Saving restarts Buzz for a few seconds." in row
                    else:
                        assert "You can turn it on here once your community is live." in row and 'name="moderation"' not in row
                    if mode == "domain":
                        assert (m.STAFF_RETURN in row) == (moderation is False and not on), (moderation, live)
                    # Staff with the operator role keep renaming public channels while it's off: said wherever the page
                    # says staff come back with it
                    assert m.OPERATOR_RENAME in m.STAFF_RETURN
                    assert ('<span class="val word">' + ("On" if on else "Off" if mode == "domain" else "Own domain only")
                            + "</span>") in row
                    if values.get("form") == "moderation":
                        assert page.count(MODERATION_OPEN) == 1 and 'role="alert">an error' in row, "the error is inside Moderation"
                    else:
                        assert MODERATION_OPEN not in page
                    # The owner form says staff stay whenever moderation has been on; the address form, what happens
                    # to moderation, only while it's on
                    owner_form = section(page, "<summary>Owner", "</form>")
                    assert (OWNER_STAFF in owner_form) == (moderation is not None), (mode, moderation)
                    assert (m.OPERATOR_RENAME in owner_form) == (moderation is not None), (mode, moderation)
                    # where Buzz can open moderation, the new owner reviews the staff; while it's on, the owner loses it
                    assert (OWNER_REVIEW in owner_form) == (moderation is not None and mode == "domain"), (mode, moderation)
                    assert (OWNER_LOSES in owner_form) == on, (mode, moderation)
                    address_form = section(page, 'action="address"', "</form>")
                    assert all((line in address_form) == on for line in ADDRESS_LINES), (mode, moderation)
                    # The safety step, on the live page alone: on the owner's own domain, Moderation's row says who can read
                    # private messages, to tell members, and points to the step's Private channels note, which says it
                    # while moderation is on, or says the note will once the community is live
                    assert ('<section class="g-pane" id="safe">' in page) == ('<a class="g-step" href="#safe">' in page) == live
                    if mode == "domain" and POINTS in row:
                        assert (SHARE_LIVE in row) == live and (SHARE_LATER in row) == (not live), (live, moderation)
                    assert ('href="#safe"' in row) == (mode == "domain" and live and POINTS in row)
                    count += 1
for values in ({}, {"owner": "x", "mode": "private", "ack": "yes"}):
    page = m.setup_page("e", values)
    assert "<main>" in page and m.SAFE_STYLE not in page; count += 1
    # Members join with an invite link; the profile menu's drawing has the dock as a new install has it
    assert OWNER_INVITES in page and PRIVATE_INVITE in page and page.count(DOCK) == 1
    assert "you add the other members" not in page and "then add them in Buzz" not in page
assert "<main>" in m.login_page("e") and m.SAFE_STYLE not in m.login_page("e"); count += 1

# The status list's moderation row, in each state, and the hint for each kind of answer from moderation's address
use(tempfile.mkdtemp())
CSP = ("default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; "
       "base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
ANSWERS = {  # what https://<domain>:8443/ can answer, and the kind the page makes of it
    "ok": (404, {"content-security-policy": CSP}, b""),
    "cloudflare": (403, {"content-type": "text/plain; charset=UTF-8"}, b"error code: 1010"),
    "port": (200, {"content-type": "application/nostr+json"}, b'{"name":"x","supported_nips":[1,11]}'),
    "nothing": (None, {}, b"timed out"),
    "other": (530, {"content-type": "text/html"}, b"<html>error code: 1033</html>"),
}
for domain in ("buzz.example.com", "a&b.example.com"):
    for moderation in (None, True, False):
        m.save(OWNER, m.owner_hex(OWNER), "domain", "buzz.example.com", True, moderation)
        setup = m.load_setup()
        for advertised in ("", "https://" + domain + ":8443", "https://old.example.com:8443"):
            for kind in (None,) + tuple(ANSWERS):
                m.forget_admin()
                key = m.admin_key(domain)
                if kind:
                    got = m.admin_answer(*ANSWERS[kind])
                    assert got[0] == kind, (kind, got)
                    m.ADMIN.update(key=key, at=time.time(), value=got)
                row = m.admin_item(setup, domain, advertised, key)
                if not m.moderation_on(setup):
                    assert (row is None) == (advertised == "") and (row is None or row["text"] == "Turning off moderation")
                    continue
                if advertised != "https://" + domain + ":8443":
                    assert row["text"] == "Turning on moderation" and not row.get("due")
                    continue
                listed = m.status_html([row])
                assert "Traceback" not in listed and html.escape("https://" + domain + ":8443") in listed
                assert "a&b" not in listed, "the domain is escaped"
                if kind is None:
                    assert row.get("due") and row["state"] == "wait" and "Checking moderation" in row["text"]
                    assert m.phase_of(setup, True, [row]).endswith(":moderation") and m.phase_of(setup, False, [row]).endswith(":starting")
                else:
                    assert row["state"] == ("ok" if kind == "ok" else "bad") and not row.get("due")
                    assert bool(row["hint"]) == (kind != "ok") and m.phase_of(setup, True, [row]).endswith(":-")
                count += 1
assert m.admin_hint("other", 530).startswith("It answered with HTTP 530.") and m.admin_hint("other", None).startswith("Reload")

# The live page's checks, one card: all ok, a problem, a check still waiting, both, and the private network's check
OK3 = [m.item("relay", "ok", "Buzz is running on this Umbrel"),
       m.item("reach", "ok", "This Umbrel's Buzz answers at <code>https://buzz.example.com</code>"),
       m.item("pair", "ok", "Phones can pair")]
PROBLEM = m.item("admin", "bad", "Moderation isn't reachable at <code>https://buzz.example.com:8443</code>", m.admin_hint("cloudflare", 403))
WAITING = m.item("admin", "wait", "Turning on moderation", "Buzz restarts for a few seconds.")
NO_PAIRING = m.item("pair", "bad", "Phone pairing isn't reachable yet", "A hint for pairing.")
DEVICE = m.item("device", "wait", "Checking from this device...", "")
TOP = re.compile(r'<div class="ck-top (\w+)" data-key="(\w+)"><span class="icon"></span><span class="text">(.*?)</span>'
                 r'<span class="hint">(.*?)</span></div>')
ROW = re.compile(r'<li class="(\w+)"[^>]*><span class="icon"></span><span class="text">(.*?)</span><span class="hint">(.*?)</span></li>')


def assert_card(card, items, tops_want, summary_want, alert):
    tops = TOP.findall(card)
    assert [(state, key) for state, key, _, _ in tops] == tops_want, (tops, tops_want)
    # above the fold, each with its own text and full hint; in the fold, every check, the ones above with "See above."
    by = {e["key"]: e for e in items}
    assert all(text == by[key]["text"] and hint == by[key]["hint"] for _, key, text, hint in tops)
    assert ROW.findall(card) == [(e["state"], e["text"], e["hint"] if e["state"] == "ok" else "See above.") for e in items]
    assert re.search(r'<span class="ck-sum">(.*?)</span><span class="val word">(.*?)</span>', card).groups() == summary_want
    assert ("ck-alert" in card) == alert and card.count('<details class="ck-all">') == 1
    assert ('data-host="' in card) == ("device" in by) and (not tops or card.index("ck-top") < card.index('<details class="ck-all">'))


for items, tops_want, summary_want, alert in (
        (OK3, [], ("Everything works", "3 checks"), False),
        (OK3[:1], [], ("Everything works", "1 check"), False),
        (OK3 + [PROBLEM], [("bad", "admin")], ("Everything else works", "3 of 4 checks"), True),
        (OK3 + [WAITING], [("wait", "admin")], ("Everything else works", "3 of 4 checks"), False),
        (OK3[:2] + [WAITING, NO_PAIRING], [("bad", "pair"), ("wait", "admin")], ("Everything else works", "2 of 4 checks"), True),
        (OK3 + [DEVICE], [("wait", "device")], ("Everything else works", "3 of 4 checks"), False)):
    assert_card(m.check_card(items), items, tops_want, summary_want, alert)
    count += 1

# Every connecting stage of the three options, through the page's own checks: the bar's segments, which one is
# current, YOU where the owner can act (nothing of its own under the bar then: the section below says what
# to do), and each problem's hint under the bar. Then each option live, as a card.
DOMAIN, TS, PUBLIC = "buzz.example.com", "buzz.tail1234.ts.net", ["104.16.0.1"]
SERVE = {"funnel": "https://" + TS + " (Funnel on)\n|-- / proxy http://buzz-gateway:80\n",
         "private": "https://" + TS + " (tailnet only)\n|-- / proxy http://buzz-gateway:80\n"}
LABELS = {"domain": ["Set up on this Umbrel", "Sign in to Cloudflare", "Cloudflare publishes the name", "Phones can pair"],
          "funnel": ["Set up on this Umbrel", "Sign in to Tailscale", "Allow Funnel", "Tailscale publishes the address", "Phones can pair"],
          "private": ["Set up on this Umbrel", "Sign in to Tailscale", "Allow HTTPS"]}
SEGMENT = re.compile(r'<li class="(\w+)"( aria-current="step")?><span class="tr"></span><span class="lb">(.*?)</span>'
                     r'<span class="vh">: (.*?)</span></li>')


def stage(mode, cf=None, link=True, upload=False, backend=None, named=False, serve="", consent=False,
          relay=True, addresses=(), live=None, pair=False, other=False):
    """A fresh setup in one stage: the tunnel's or the Tailscale machine's files, and the relay and the public name
    as the page's checks see them. Returns the setup."""
    use(tempfile.mkdtemp())
    domain = DOMAIN if mode == "domain" else TS if named else ""
    m.save(OWNER, m.owner_hex(OWNER), mode, domain)
    if cf is not None:
        open(m.CLOUDFLARE_STATE, "w").write(cf + "\n")
        open(m.CLOUDFLARE_LOGIN, "w").write("https://dash.cloudflare.com/argotunnel?aud=&callback=x\n" if link else "Starting\n")
        if upload:
            open(m.CLOUDFLARE_UPLOAD, "w").write("a sign-in the owner uploaded\n")
    if backend is not None:
        json.dump({"BackendState": backend, "AuthURL": "https://login.tailscale.com/a/x",
                   "Self": {"DNSName": domain + "." if domain else "", "ID": "n1"}}, open(m.TAILSCALE_STATUS, "w"))
        open(m.TAILSCALE_SERVE, "w").write(SERVE.get(serve, ""))
        if consent:
            open(os.path.join(m.TAILSCALE_DIR, "tailscale-publish.log"), "w").write(
                "To enable, visit:\n\n https://login.tailscale.com/f/" + ("funnel" if mode == "funnel" else "serve") + "?node=n1\n")

    def request(host, port, path, tls=False, headers=None, timeout=6, addr=None):
        if host == m.RELAY_HOST:
            if not relay:
                return None, b"connection refused"
            return (200, b"ok") if path == "/_readiness" else (200, json.dumps({"self": "aa" * 32}).encode())
        if path == "/pair":
            return (101, b"") if pair else (None, b"connection refused")
        if live is None:
            return None, b"Name or service not known"
        if path == "/_liveness":
            return live
        return 200, json.dumps({"self": ("bb" if other else "aa") * 32}).encode()
    m.request, m.resolves, m.check = request, (lambda name: list(addresses)), CHECK
    m.CACHE["key"] = None
    return m.load_setup()


def rendered(setup):
    """The page, its checks as status.json sends them, and those checks themselves."""
    page = m.main_page(setup)
    live, items = m.check(setup)
    checks = m.checks_html(setup, live, items)
    # status.json's checks are the page's, with the same signature, and after them, outside what the refresh swaps,
    # the one place a screen reader hears that they changed
    assert ('data-sig="' + m.checks_sig(checks) + '">' + checks + "</div>" + SAID) in page and page.count(SAID) == 1
    return page, live, items, checks


# Each stage, the states of the bar's segments, and what shows under it: problems (!) with their hints, then the current
# stage's checks that wait
PHASES = (
    ("domain", "starting Cloudflare's sign-in while Buzz starts", dict(cf="", relay=False), "done work wait wait", ""),
    ("domain", "starting Cloudflare's sign-in", dict(cf=""), "done work wait wait", ""),
    ("domain", "the sign-in, its link not there yet", dict(cf="signin", link=False), "done work wait wait", ""),
    ("domain", "the sign-in link while Buzz starts", dict(cf="signin", relay=False), "done you wait wait", ""),
    ("domain", "the sign-in link", dict(cf="signin"), "done you wait wait", ""),
    ("domain", "signed in with the file Cloudflare saved", dict(cf="signin", upload=True), "done done work wait", "cloudflare dns"),
    ("domain", "creating the tunnel", dict(cf="creating"), "done done work wait", "cloudflare dns"),
    ("domain", "creating the tunnel while Buzz starts", dict(cf="creating", relay=False), "done done work wait", "cloudflare dns relay"),
    ("domain", "routing the name", dict(cf="routing"), "done done work wait", "cloudflare dns"),
    ("domain", "the tunnel runs, the name not published", dict(cf="running"), "done done work wait", "dns"),
    ("domain", "published, nothing answers yet", dict(cf="running", addresses=PUBLIC, live=(None, b"timed out")), "done done work wait", "reach"),
    ("domain", "published, no certificate yet", dict(cf="running", addresses=PUBLIC, live=(None, b"tls [SSL: CERTIFICATE_VERIFY_FAILED]")),
     "done done work wait", "reach"),
    ("domain", "published, no connected tunnel", dict(cf="running", addresses=PUBLIC, live=(530, b"error code: 1033")), "done done bad wait", "!reach"),
    ("domain", "published, the tunnel can't reach Buzz", dict(cf="running", addresses=PUBLIC, live=(502, b"")), "done done bad wait", "!reach"),
    ("domain", "another relay answers there", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), other=True), "done done bad wait", "!reach"),
    ("domain", "the name answers while Buzz restarts", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), relay=False),
     "done done work wait", "relay"),
    ("domain", "pairing answers while Buzz restarts", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), relay=False, pair=True),
     "done done work wait", "relay"),
    ("domain", "reachable, pairing not yet", dict(cf="running", addresses=PUBLIC, live=(200, b"ok")), "done done done work", "pair"),
    # after the sign-in, a name taken or a step refused blocks the name; a wrong domain needs a new sign-in
    ("domain", "the name is taken", dict(cf="taken"), "done done bad wait", "!cloudflare dns"),
    ("domain", "the wrong domain chosen", dict(cf="wrong-domain"), "done bad wait wait", "!cloudflare"),
    ("domain", "Cloudflare refused a step", dict(cf="error"), "done done bad wait", "!cloudflare dns"),
    ("funnel", "starting Tailscale", dict(backend="NoState", relay=False), "done work wait wait wait", ""),
    ("funnel", "Tailscale's sign-in link", dict(backend="NeedsLogin", relay=False), "done you wait wait wait", ""),
    ("funnel", "approving the machine", dict(backend="NeedsMachineAuth", relay=False), "done you wait wait wait", ""),
    ("funnel", "Funnel to allow while Buzz starts", dict(backend="Running", named=True, consent=True, relay=False), "done done you wait wait", ""),
    ("funnel", "Funnel to allow", dict(backend="Running", named=True, consent=True), "done done you wait wait", ""),
    ("funnel", "waiting for Tailscale to ask", dict(backend="Running", named=True), "done done work wait wait", "publish"),
    ("funnel", "Funnel on, the name not published", dict(backend="Running", named=True, serve="funnel"), "done done done work wait", "dns"),
    ("funnel", "Funnel on, nothing answers yet", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                      live=(None, b"timed out")), "done done done work wait", "reach"),
    ("funnel", "Funnel on, an error answers", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                   live=(502, b"")), "done done done bad wait", "!reach"),
    ("funnel", "Funnel on, the address answers while Buzz starts", dict(backend="Running", named=True, serve="funnel",
                                                                        addresses=PUBLIC, live=(200, b"ok"), relay=False),
     "done done done work wait", "relay"),
    ("funnel", "reachable, pairing not yet", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC,
                                                  live=(200, b"ok")), "done done done done work", "pair"),
    ("private", "starting Tailscale", dict(backend="Starting", relay=False), "done work wait", ""),
    ("private", "Tailscale's sign-in link", dict(backend="NeedsLogin", relay=False), "done you wait", ""),
    ("private", "approving the machine", dict(backend="NeedsMachineAuth", relay=False), "done you wait", ""),
    ("private", "HTTPS to allow while Buzz starts", dict(backend="Running", named=True, consent=True, relay=False), "done done you", ""),
    ("private", "HTTPS to allow", dict(backend="Running", named=True, consent=True), "done done you", ""),
    ("private", "getting the certificate", dict(backend="Running", named=True), "done done work", "publish"),
    ("private", "on the network while Buzz starts", dict(backend="Running", named=True, serve="private", relay=False), "done done work", "relay"),
)
for mode, what, files, want, under in PHASES:
    setup = stage(mode, **files)
    page, live, items, checks = rendered(setup)
    assert not live and "<h1>Connect " in page and '<section class="next">' not in page and '<div class="set-card ck-card' not in page, what
    segments = SEGMENT.findall(checks)
    states = [state for state, _, _, _ in segments]
    assert states == want.split(), (mode, what, states)
    assert checks.count('style="--n:' + str(len(states)) + '"') == 1
    labels = LABELS[mode][:]
    if files.get("backend") == "NeedsMachineAuth":
        labels[1] = "Approve buzz in Tailscale"
    assert [re.sub(r"<b[^>]*>!</b>|<em[^>]*>YOU</em>|<[^>]+>", "", label) for _, _, label, _ in segments] == labels, (mode, what)
    # The setup is saved, so the first stage is done. The current step is the earliest stage not done, and the only one
    # at work or the owner's turn; every stage after it waits, or is red with a problem of its own: none waits before
    # a stage that works or is done.
    first = next(i for i, state in enumerate(states) if state != "done")
    assert states[0] == "done" and [i for i, (_, mark, _, _) in enumerate(segments) if mark] == [first], (mode, what)
    assert states[first] in ("work", "you", "bad") and set(states[first + 1:]) <= {"wait", "bad"}, (mode, what, states)
    # and a screen reader hears that stage when the checks change
    assert re.search(r'<ol class="bar" [^>]*data-say="([^"]*)"', checks).group(1) == labels[first] + ": " + m.STAGE_WORDS[states[first]] + "."
    for state, _, label, said in segments:
        assert ('<em aria-hidden="true">YOU</em>' in label) == (state == "you") and said.startswith(m.STAGE_WORDS[state] + ".")
        assert (m.ti("check") in label) == (state == "done") and ('<i aria-hidden="true"></i>' in label) == (state == "work")
    # every check's sentence is there for screen readers, and the device check waits for the live page
    assert all(e["text"] in checks for e in items if e["key"] != "device") and 'data-host="' not in checks
    # Under the bar, every problem with its hint, then the current stage's checks that wait, quietly
    by = {e["key"]: e for e in items}
    shown = [("bad" if key.startswith("!") else "wait", key.lstrip("!")) for key in under.split()]
    assert [e["key"] for e in items if e["state"] == "bad"] == [key for state, key in shown if state == "bad"], (mode, what)
    assert TOP.findall(checks) == [(state, key, by[key]["text"], by[key]["hint"]) for state, key in shown], (mode, what, TOP.findall(checks))
    assert ("ck-alert" in checks) == any(state == "bad" for state, _ in shown)
    assert checks.count('<b aria-hidden="true">!</b>') == states.count("bad")
    count += 1

for mode, files, tops_want, summary_want in (
        ("domain", dict(cf="running", addresses=PUBLIC, live=(200, b"ok"), pair=True), [], ("Everything works", "3 checks")),
        ("funnel", dict(backend="Running", named=True, serve="funnel", addresses=PUBLIC, live=(200, b"ok"), pair=True), [],
         ("Everything works", "5 checks")),
        ("private", dict(backend="Running", named=True, serve="private"), [("wait", "device")], ("Everything else works", "3 of 4 checks"))):
    setup = stage(mode, **files)
    page, live, items, checks = rendered(setup)
    assert live and '<section class="next">' in page and '<ol class="bar"' not in page, mode
    assert_card(checks, items, tops_want, summary_want, False)
    assert ('data-host="' + TS + '"' in checks) == (mode == "private")
    count += 1
print("rendered", count, "page states without errors")
