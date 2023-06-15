import * as jwt from 'jsonwebtoken';
import pool from './db-connection';
import {Response} from "express";

export function checkRequiredParams(params: string[], req_params: string[]): boolean {
    for (const req_param of req_params) {
        if (!params.includes(req_param)) {
            return false;
        }
    }
    return true;
}

export function login(res: Response, login: string, password: string) {
    pool.query(`SELECT * FROM user WHERE login=? AND password=?`, [login, password]).then((result) => {
        const user = (result as any)[0][0];

        if (user) {
            pool.query(`REPLACE INTO online_user VALUES (?)`, [user.id]);

            const token = jwt.sign({id: user.id, login: user.login}, process.env.PRIVATE_KEY as string, {algorithm: 'HS256'});

            const authUser = {
                first_name: user.first_name,
                last_name: user.last_name,
                id: user.id,
                role: user.role,
                token
            };

            res.send(JSON.stringify(authUser));
        } else {
            res.sendStatus(401);
        }
    });
}

export function register(res: Response, login: string, password: string, firstName: string, lastName: string) {
    pool.query(`SELECT count(*) as loginCount FROM user WHERE login=?`, [login]).then(result => {
       const loginCount = (result[0] as any)[0].loginCount;

       if (loginCount != 0) {
           res.status(400).json({
               errorMessage: 'Пользователь с таким логином уже существует'
           }).end();
       } else {
           pool.query(`INSERT INTO user (login, password, first_name, last_name) VALUES (?, ?, ?, ?)`,
               [login, password, firstName, lastName]).then(result => {
                   const id = (result[0] as any).insertId;

                   pool.query(`SELECT first_name, last_name, id FROM user WHERE id=?`, [id]).then(result => {
                       const user = (result[0] as any)[0];

                       user.token = jwt.sign({
                           id: user.id,
                           login: user.login
                       }, process.env.PRIVATE_KEY as string, {algorithm: 'HS256'});

                       res.json(user).end();
                   });
           });
       }
    });
}

export function logout(res: Response, id: string) {
    pool.query(`DELETE FROM online_user WHERE id=?`, [id]);
}

export function checkJwt(token: string): {check: boolean, claims?: any} {
    const privateKey: string = process.env.PRIVATE_KEY as string;

    try {
        const claims = jwt.verify(token, privateKey);

        return {
            check: true,
            claims
        };
    } catch (error) {
        return {
            check: false
        }
    }
}

export function getDialogListItem(res: Response, id: string, authUserId: string) {
    pool.query(`SELECT u.first_name, u.last_name, u.id,
        (SELECT message_text FROM message m WHERE (m.send_from_id=u.id AND m.send_to_id=? OR m.send_from_id=? AND m.send_to_id=u.id) 
            ORDER BY timestamp DESC LIMIT 1) as last_message,
        (SELECT count(*) FROM message m WHERE m.send_from_id=u.id AND m.send_to_id=? AND m.is_read=FALSE) as unread_messages_amount
        FROM user u WHERE u.id=?`, [authUserId, authUserId, authUserId, id]).then(result => {
        const users = (result[0] as any);

        res.json(users[0]).end();
    });
}

export function getDialogList(res: Response, authId: string, search?: string) {
    let searchString: string;
    if (!search) {
        searchString = '%%';
    } else {
        searchString = `%${search}%`;
    }
    clearEmptyDialogs(authId).then(result => {
            pool.query(`SELECT u.id, u.first_name, u.last_name,
                            (SELECT message_text FROM message m WHERE m.send_from_id=u.id AND m.send_to_id=? OR m.send_from_id=? AND m.send_to_id=u.id
                            ORDER BY timestamp DESC LIMIT 1) as last_message,
                            (SELECT timestamp FROM message m WHERE m.send_from_id=u.id AND m.send_to_id=? OR m.send_from_id=? AND m.send_to_id=u.id
                            ORDER BY timestamp DESC LIMIT 1) as timestamp,
                            (SELECT count(*) FROM message m WHERE m.send_from_id=u.id AND m.send_to_id=? AND m.is_read=FALSE) as unread_messages_amount,
                            IF (u.id IN (SELECT * FROM online_user), TRUE, FALSE) as is_online,
                            -1 as room_id
                            FROM user u 
                            WHERE 
                            u.id IN (
                                SELECT DISTINCT first_id FROM dialog WHERE second_id=? 
                                UNION 
                                SELECT second_id as first_id from dialog d WHERE d.first_id=?)
                            AND
                            IF (
                                u.id IN (
                                    SELECT created_by FROM dialog d
                                    WHERE (SELECT count(*) FROM message
                                    WHERE send_from_id=d.first_id AND send_to_id=d.second_id
                                    OR
                                    send_from_id=d.second_id AND send_to_id=d.first_id) = 0
                                    AND created_by!=?
                                ),
                                false,
                                true
                            )
                            AND CONCAT(u.first_name, ' ', u.last_name, ' ', u.last_name, ' ', u.first_name) LIKE ?
                            ORDER BY timestamp DESC`, [authId, authId, authId, authId, authId, authId, authId, authId, searchString]).then(result => {
                                const userList = (result[0] as any);

                                pool.query(`
                                    SELECT 
                                        r.room_id, 
                                        r.room_name,
                                        (SELECT message_text FROM message WHERE room_id=r.room_id ORDER BY timestamp DESC LIMIT 1) as last_message,
                                        (SELECT timestamp FROM message m WHERE room_id=r.room_id ORDER BY timestamp DESC LIMIT 1) as timestamp,
                                        (SELECT count(*) FROM unread_message_by WHERE unread_by=? AND room_id=r.room_id) as unread_messages_amount
                                    FROM room r 
                                    WHERE r.room_id 
                                    IN 
                                    (SELECT room_id FROM room_member WHERE user_id=?)
                                    AND r.room_name LIKE ?`, [authId, authId, searchString])
                                .then(result => {
                                    const rooms = result[0] as any;

                                    userList.push(...rooms);

                                    res.json(userList).end();
                                })
                                .catch(err => {

                                });
            });
    });
}

export function clearEmptyDialogs(authId: string) {
    return pool.query(`DELETE FROM dialog d
        WHERE (SELECT count(*) FROM message 
        WHERE send_from_id=d.first_id AND send_to_id=d.second_id
        OR
        send_from_id=d.second_id AND send_to_id=d.first_id) = 0
        AND created_by=?`, [ authId ])
        .catch(err => {
            console.log(err);
        });
}

export function getDialogMessagesCount(res: Response, id: string, authId: string) {
    pool.query(`SELECT count(*) as total_count FROM message WHERE send_from_id=? AND send_to_id=? OR send_from_id=? AND send_to_id=?`, [id, authId, authId, id]).then(result => {
        const amount = (result[0] as any)[0];

        res.json(amount).end();
    });
}

export function getDialog(res: Response, id: string, authUserId: string, limit: number, offset: number) {
    clearEmptyDialogs(authUserId).then((result) => {
            pool.query(`SELECT * FROM dialog WHERE first_id=? AND second_id=? OR first_id=? AND second_id=?`, [id, authUserId, authUserId, id]).then(result => {
                const dialog = (result[0] as any);

                if (!dialog || dialog.length == 0) {
                    pool.query('INSERT INTO dialog VALUES (?, ?, ?), (?, ?, ?)', [id, authUserId, authUserId, authUserId, id, authUserId]).then(result => {
                        returnDialog(res, id, authUserId, limit, offset);
                    });
                } else {
                    returnDialog(res, id, authUserId, limit, offset);
                }
            });
    });
}

function returnDialog(res: Response, id: string, authUserId: string, limit: number, offset: number) {
    pool.query(`SELECT * FROM message WHERE send_from_id=? AND send_to_id=? OR send_from_id=? AND send_to_id=? ORDER BY timestamp LIMIT ? OFFSET ?`,
        [id, authUserId, authUserId, id, limit, offset]).then(result => {
        const items = (result[0] as any);

        pool.query(`SELECT count(*) as total_count FROM message WHERE send_from_id=? AND send_to_id=? OR send_from_id=? AND send_to_id=?`, [id, authUserId, authUserId, id]).then(result => {
            const total_count = Number((result[0] as any)[0].total_count);

            let isEnd = false;

            if (offset == 0) {
                isEnd = true;
            }

            const response = {
                items,
                limit,
                offset,
                total_count,
                isEnd
            };

            res.json(response).status(200).end();
        });
    });
}

export function getUserById(res: Response, id: string, authId: string) {
    pool.query(`SELECT
        IF (u.id IN (SELECT first_id FROM friends WHERE second_id=?), TRUE, FALSE) as is_friends,
        IF ((SELECT count(*) FROM friend_request WHERE request_from=? AND request_to=u.id) > 0, TRUE, FALSE) as is_requested_friends_from_auth_user,
        IF ((SELECT count(*) FROM friend_request WHERE request_from=u.id AND request_to=?) > 0, TRUE, FALSE) as is_requested_friends_to_auth_user,
        u.id, u.first_name, u.last_name FROM user u WHERE u.id=?`, [authId, authId, authId, id]).then(result => {
        const user = (result[0] as any)[0];

        res.json(user).status(200).end();
    });
}

export function getUserImage(res: Response, id: string) {
    pool.query(`SELECT * FROM file WHERE file_id=(SELECT user_image_id FROM user WHERE id=?)`, [id]).then(result => {
        if (result[0] && (result[0] as any)[0]) {
            const dirtyImage = (result[0] as any)[0];

            const image = {
                data: dirtyImage.data,
                type: dirtyImage.type
            };

            res.json(image).end();
        } else {
            res.send().end();
        }
    })
}

export function safeUserImage(res: Response, type: string, data: string, id: string) {
    const image = {
        type,
        data
    };

    pool.query(`
        INSERT INTO file (type, data) VALUES (?, ?) 
        ON DUPLICATE KEY UPDATE type = values(type), data = values(data)`, [image.type, image.data])
    .then(result => {
        const result_info = result[0] as any;

        if (result_info.affectedRows) {
            const image_id = result_info.insertId;

            pool.query(`UPDATE user SET user_image_id=? WHERE id=?`, [image_id, id]).then(result => {
                pool.query(`SELECT type, data FROM file WHERE file_id=?`, [image_id]).then(result => {
                    const image = (result[0] as any)[0];

                    res.json(image).end();
                });
            });
        }
    });
}

export function getUnreadMessagesAmount(res: Response, authId: string, id: string) {
    pool.query(`SELECT count(*) as unread FROM message WHERE (send_from_id=? and send_to_id=? and is_read=FALSE)`, [id, authId]).then(result => {
       const amount = (result[0] as any)[0];

       res.json(amount).end();
    });
}

export function getUserList(res: Response, authId: string, category: string) {
    let query = '';
    let params = [];
    if (category == 'FRIENDS') {
        query = `SELECT 
            IF (u.id IN (SELECT * FROM online_user), TRUE, FALSE) as is_online,
            TRUE as is_friends,
            FALSE as is_requested_friends_from,
            FALSE as is_requested_friends_to,
            u.id, u.first_name, u.last_name FROM user u 
            WHERE u.id IN (SELECT first_id FROM friends WHERE second_id=?)`;
        params.push(authId);
    } else if (category == 'ALL') {
        query = `SELECT 
            IF (u.id IN (SELECT * FROM online_user), TRUE, FALSE) as is_online,
            IF (u.id IN (SELECT first_id FROM friends WHERE second_id=?), TRUE, FALSE) as is_friends,
            IF ((SELECT count(*) FROM friend_request WHERE request_from=? AND request_to=u.id) > 0, TRUE, FALSE) as is_requested_friends_from_auth_user,
            IF ((SELECT count(*) FROM friend_request WHERE request_from=u.id AND request_to=?) > 0, TRUE, FALSE) as is_requested_friends_to_auth_user,
            u.id, u.first_name, u.last_name FROM user u`;
        params.push(authId, authId, authId);
    }

    pool.query(query, params).then(result => {
        const users = result[0];

        res.json(users).end();
    });
}
