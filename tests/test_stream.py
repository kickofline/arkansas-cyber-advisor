from unittest.mock import patch, MagicMock


def _make_chunk(content):
    chunk = MagicMock()
    chunk.message.content = content
    return chunk


def test_stream_unauthenticated_still_works(client):
    """Logged-out users can stream — no chat_id, no DB save."""
    mock_chunks = [_make_chunk('Hello'), _make_chunk(' world')]
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_client_factory.return_value = mock_client

        res = client.post('/api/stream', json={
            'message': 'hi',
            'history': [],
            'chat_id': None
        })
    assert res.status_code == 200
    body = res.data.decode()
    assert 'Hello' in body
    assert '[DONE]' in body


def test_stream_saves_message_when_authenticated(auth_client):
    mock_chunks = [_make_chunk('Safe'), _make_chunk(' advice')]
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_client_factory.return_value = mock_client

        create_res = auth_client.post('/api/chats', json={'title': 'Test'})
        chat_id = create_res.get_json()['id']

        auth_client.post('/api/stream', json={
            'message': 'how do I stay safe?',
            'history': [],
            'chat_id': chat_id
        })

    chat_res = auth_client.get(f'/api/chats/{chat_id}')
    messages = chat_res.get_json()['messages']
    assert any(m['role'] == 'assistant' and 'Safe advice' in m['content'] for m in messages)


def test_stream_error_returns_error_event(client):
    with patch('stream.get_ollama_client') as mock_client_factory:
        mock_client = MagicMock()
        mock_client.chat.side_effect = Exception('Ollama offline')
        mock_client_factory.return_value = mock_client

        res = client.post('/api/stream', json={'message': 'hi', 'history': []})
    assert res.status_code == 200
    assert b'[ERROR]' in res.data


def test_stream_requires_message(client):
    res = client.post('/api/stream', json={'message': '', 'history': []})
    assert res.status_code == 400
