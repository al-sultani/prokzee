CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT,
            url TEXT,
            port TEXT,
            request_headers TEXT,
            request_body TEXT,
            http_version TEXT,
            response_headers TEXT,
            response_body TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            method varchar NOT NULL DEFAULT 'GET',
            status varchar NOT NULL DEFAULT '',
            path TEXT DEFAULT '',
            query TEXT DEFAULT '',
            domain TEXT DEFAULT '',
            length INTEGER DEFAULT 0,
            mime_type TEXT DEFAULT ''
        );
CREATE TABLE IF NOT EXISTS rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT,
            operator TEXT,
            match_type TEXT,
            relationship TEXT,
            pattern TEXT,
            enabled INTEGER DEFAULT 1
        );
CREATE TABLE IF NOT EXISTS match_replace_rules (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			rule_name TEXT,
			match_type TEXT,
			match_content TEXT,
			replace_content TEXT,
			target TEXT,
			enabled BOOLEAN
);
CREATE TABLE IF NOT EXISTS scope_lists (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			type TEXT,
			pattern TEXT
		);
CREATE TABLE IF NOT EXISTS resender_tabs (
            id integer,
            name varchar DEFAULT 'Tab',
            request_ids_arr varchar,
            timestamp datetime,
            PRIMARY KEY (id)
        );
CREATE TABLE IF NOT EXISTS settings (
            id integer,
            project_name varchar,
            openai_api_url varchar,
            openai_api_key varchar,
            proxy_port varchar,
            theme varchar,
            interactsh_host varchar,
            interactsh_port int,
            created_at DATETIME,
            PRIMARY KEY (id)
        );
CREATE TABLE IF NOT EXISTS chat_contexts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        name TEXT DEFAULT 'New Context'
    );
CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_context_id INTEGER,
        role TEXT,
        content TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (chat_context_id) REFERENCES chat_contexts(id)
    );
CREATE TABLE IF NOT EXISTS fuzzer_tabs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            target_url TEXT,
            path TEXT,
            method TEXT,
            http_version TEXT,
            headers TEXT,
            body TEXT,
            payloads TEXT
        );
CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            level TEXT NOT NULL,
            message TEXT NOT NULL,
            source TEXT NOT NULL
        );
CREATE INDEX IF NOT EXISTS idx_requests_timestamp 
        ON requests(timestamp DESC)
    ;
CREATE TABLE IF NOT EXISTS resender_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT,
            url TEXT,
            port TEXT,
            request_headers TEXT,
            request_body TEXT,
            http_version TEXT,
            response_headers TEXT DEFAULT '{}',
            response_body TEXT DEFAULT '',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            method varchar NOT NULL DEFAULT 'GET',
            status varchar NOT NULL DEFAULT '200 OK',
            path TEXT DEFAULT '',
            query TEXT DEFAULT '',
            domain TEXT DEFAULT '',
            length INTEGER DEFAULT 0,
            mime_type TEXT DEFAULT ''
        );
CREATE TABLE IF NOT EXISTS plugins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            description TEXT,
            is_active INTEGER NOT NULL DEFAULT 0,
            code TEXT,
            template TEXT,
            version TEXT,
            author TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
