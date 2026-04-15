import json
import urllib.request
import urllib.error
from flask import Blueprint, request, jsonify, current_app

bp = Blueprint('feedback', __name__, url_prefix='/api')


def _send_to_teams(webhook_url, sentiment, comment, conversation):
    icon  = '\U0001f44d' if sentiment == 'positive' else '\U0001f44e'
    label = 'Positive' if sentiment == 'positive' else 'Negative'

    conv_lines = []
    for msg in conversation[-12:]:
        role    = 'User' if msg.get('role') == 'user' else 'Advisor'
        content = (msg.get('content') or '').strip()
        if content:
            conv_lines.append(f'**{role}:** {content}')
    conv_text = '\n\n'.join(conv_lines) or '*(no conversation)*'

    facts = [{'name': 'Sentiment', 'value': f'{icon} {label}'}]
    if comment:
        facts.append({'name': 'Comment', 'value': comment})

    card = {
        '@type':    'MessageCard',
        '@context': 'http://schema.org/extensions',
        'themeColor': '532987',
        'summary': f'Cyber Advisor Feedback: {label}',
        'sections': [
            {
                'activityTitle': f'{icon} Cyber Advisor Feedback',
                'facts': facts,
            },
            {
                'title': 'Conversation',
                'text':  conv_text,
            },
        ],
    }

    payload = json.dumps(card).encode('utf-8')
    req = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=10) as resp:
        resp.read()


@bp.route('/feedback', methods=['POST'])
def submit_feedback():
    webhook_url = current_app.config.get('TEAMS_WEBHOOK_URL', '')
    if not webhook_url:
        return jsonify({'error': 'Feedback is not configured on this server'}), 503

    data = request.get_json() or {}
    sentiment = data.get('sentiment', '')
    if sentiment not in ('positive', 'negative'):
        return jsonify({'error': 'Invalid sentiment'}), 400

    comment      = (data.get('comment') or '').strip()[:1000]
    conversation = data.get('conversation') or []

    try:
        _send_to_teams(webhook_url, sentiment, comment, conversation)
    except urllib.error.URLError as e:
        return jsonify({'error': f'Could not reach Teams webhook: {e.reason}'}), 502
    except Exception as e:
        return jsonify({'error': str(e)}), 502

    return jsonify({'ok': True})
