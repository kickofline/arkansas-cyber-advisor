from unittest.mock import patch, MagicMock


def _make_chunk(content):
    chunk = MagicMock()
    chunk.message.content = content
    chunk.message.thinking = None
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

        res = auth_client.post('/api/stream', json={
            'message': 'how do I stay safe?',
            'history': [],
            'chat_id': chat_id
        })
        _ = res.data  # consume full stream so generator runs to completion

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


def test_stream_sends_images_to_ollama(auth_client):
    import io
    upload_res = auth_client.post(
        '/api/images/upload',
        data={'files[]': (io.BytesIO(b'\x89PNG'), 'test.png', 'image/png')},
        content_type='multipart/form-data',
    )
    assert upload_res.status_code == 201
    img_id = upload_res.get_json()['ids'][0]

    mock_chunks = [_make_chunk('I see an image')]
    with patch('stream.get_ollama_client') as mock_factory:
        mock_client = MagicMock()
        mock_client.chat.return_value = iter(mock_chunks)
        mock_factory.return_value = mock_client

        create_res = auth_client.post('/api/chats', json={'title': 'Img Chat'})
        chat_id = create_res.get_json()['id']
        auth_client.post(
            f'/api/chats/{chat_id}/messages',
            json={'role': 'user', 'content': 'What is this?'}
        )

        res = auth_client.post('/api/stream', json={
            'message': 'What is this?',
            'history': [],
            'chat_id': chat_id,
            'image_ids': [img_id],
        })
        _ = res.data  # consume stream

    call_kwargs = mock_client.chat.call_args_list[-1].kwargs
    messages_sent = call_kwargs['messages']
    user_msg = next(m for m in messages_sent if m['role'] == 'user')
    assert 'images' in user_msg
    assert len(user_msg['images']) == 1
