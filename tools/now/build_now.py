"""Write now.json, the data behind the site's "Now" section, from Q's GitHub activity.

Run by .github/workflows/now.yml every six hours with the workflow's own GITHUB_TOKEN. Public
repositories are shown with their names and commit messages. Private work only ever appears as a
count: repositories marked private are dropped here even when the token can see them.

  GITHUB_TOKEN=... python3 tools/now/build_now.py [out.json]
"""
import datetime as dt
import json
import os
import sys
import urllib.request

USER = os.environ.get('NOW_USER', 'Qil159753')
TOKEN = os.environ['GITHUB_TOKEN']
WEEKS = 12
REPOS = 4      # public repos listed
COMMITS = 3    # commit messages per repo
SKIP_AUTHORS = {'github-actions[bot]'}


def api(path, body=None):
    req = urllib.request.Request('https://api.github.com' + path, data=json.dumps(body).encode() if body else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json',
                                          'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'now-builder'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


QUERY = '''query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      restrictedContributionsCount
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 25) {
        repository { name nameWithOwner url isPrivate description primaryLanguage { name } }
        contributions { totalCount }
      }
    }
  }
}'''


def main():
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    start = (now - dt.timedelta(weeks=WEEKS)).replace(hour=0, minute=0, second=0)
    data = api('/graphql', {'query': QUERY, 'variables': {'login': USER, 'from': start.isoformat(), 'to': now.isoformat()}})
    if 'errors' in data:
        sys.exit(f"GraphQL: {data['errors']}")
    cc = data['data']['user']['contributionsCollection']

    days = [{'d': d['date'], 'n': d['contributionCount']}
            for w in cc['contributionCalendar']['weeks'] for d in w['contributionDays']]
    days = days[-WEEKS * 7:]

    public, private_commits = [], 0
    for item in cc['commitContributionsByRepository']:
        repo, n = item['repository'], item['contributions']['totalCount']
        if repo['isPrivate']:
            private_commits += n          # a count, never the name
            continue
        public.append((n, repo))
    public.sort(key=lambda t: -t[0])

    since = (now - dt.timedelta(days=30)).isoformat()
    repos = []
    for n, repo in public:
        if len(repos) == REPOS:
            break
        commits = api(f"/repos/{repo['nameWithOwner']}/commits?author={USER}&since={since}&per_page=10")
        msgs = []
        for c in commits:
            if (c.get('author') or {}).get('login') in SKIP_AUTHORS or len(c.get('parents', [])) > 1:
                continue   # bot refreshes and merge commits aren't news
            msgs.append({'msg': c['commit']['message'].split('\n', 1)[0][:120],
                         'date': c['commit']['author']['date'], 'url': c['html_url']})
            if len(msgs) == COMMITS:
                break
        if not msgs:
            continue
        repos.append({'name': repo['name'], 'url': repo['url'], 'desc': repo['description'] or '',
                      'lang': (repo['primaryLanguage'] or {}).get('name', ''), 'commits': n, 'recent': msgs})

    active = [d['d'] for d in days if d['n']]
    latest = max([m['date'] for r in repos for m in r['recent']] + ([active[-1] + 'T00:00:00Z'] if active else []), default=None)
    out = {
        'user': USER,
        'weeks': WEEKS,
        'days': days,
        'total': sum(d['n'] for d in days),
        'private': cc['restrictedContributionsCount'] + private_commits,
        'active_days': len(active),
        'last_active': latest,
        'repos': repos,
    }
    path = sys.argv[1] if len(sys.argv) > 1 else 'now.json'
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        f.write('\n')
    print(f"{path}: {out['total']} contributions in {WEEKS} weeks, {out['private']} private, {len(repos)} public repos")


if __name__ == '__main__':
    main()
