def test_list_chats_unauthenticated(client):
    res = client.get('/api/chats')
    assert res.status_code == 401


def test_create_chat(auth_client):
    res = auth_client.post('/api/chats', json={'title': 'My First Chat'})
    assert res.status_code == 201
    data = res.get_json()
    assert data['title'] == 'My First Chat'
    assert 'id' in data


def test_list_chats(auth_client):
    auth_client.post('/api/chats', json={'title': 'Chat One'})
    auth_client.post('/api/chats', json={'title': 'Chat Two'})
    res = auth_client.get('/api/chats')
    assert res.status_code == 200
    data = res.get_json()
    assert len(data) == 2


def test_get_chat(auth_client):
    create_res = auth_client.post('/api/chats', json={'title': 'Test Chat'})
    chat_id = create_res.get_json()['id']
    res = auth_client.get(f'/api/chats/{chat_id}')
    assert res.status_code == 200
    data = res.get_json()
    assert data['chat']['title'] == 'Test Chat'
    assert data['messages'] == []


def test_get_chat_not_found(auth_client):
    res = auth_client.get('/api/chats/nonexistent-id')
    assert res.status_code == 404


def test_add_message(auth_client):
    create_res = auth_client.post('/api/chats', json={'title': 'Test Chat'})
    chat_id = create_res.get_json()['id']
    res = auth_client.post(
        f'/api/chats/{chat_id}/messages',
        json={'role': 'user', 'content': 'Hello!'}
    )
    assert res.status_code == 201
    chat_res = auth_client.get(f'/api/chats/{chat_id}')
    messages = chat_res.get_json()['messages']
    assert len(messages) == 1
    assert messages[0]['content'] == 'Hello!'


def test_migrate_chats(auth_client):
    chats = [
        {
            'title': 'Old Chat',
            'messages': [
                {'role': 'user', 'content': 'Hi'},
                {'role': 'assistant', 'content': 'Hello!'}
            ]
        }
    ]
    res = auth_client.post('/api/migrate', json={'chats': chats})
    assert res.status_code == 200
    data = res.get_json()
    assert data['imported'] == 1
    list_res = auth_client.get('/api/chats')
    assert len(list_res.get_json()) == 1


def test_get_chat_messages_include_image_ids(auth_client):
    import io
    create_res = auth_client.post('/api/chats', json={'title': 'Img Chat'})
    chat_id = create_res.get_json()['id']

    # Add a user message
    auth_client.post(
        f'/api/chats/{chat_id}/messages',
        json={'role': 'user', 'content': 'Look at this'}
    )

    # Get messages — image_ids should default to empty list
    res = auth_client.get(f'/api/chats/{chat_id}')
    assert res.status_code == 200
    messages = res.get_json()['messages']
    assert len(messages) == 1
    assert messages[0]['image_ids'] == []
