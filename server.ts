import express, {query} from 'express';
import * as utils from './utils';
import pool from "./db-connection";
import {PoolConnection} from "mysql2/promise";
import Query from "mysql2/typings/mysql/lib/protocol/sequences/Query";

const server = express();

const jsonParser = express.json({limit: '75mb'});

const apiRouter = express.Router();

server.use((req, res, next) => {
   res.setHeader('Access-Control-Allow-Origin', '*');
   res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH');
   res.setHeader('Access-Control-Allow-Headers', 'X-Auth-Token, Content-Type');
   next();
});

apiRouter.use(jsonParser);

apiRouter.get('/login', (req, res) => {
    const login = req.query.login as string;
    const password = req.query.password as string;

    utils.login(res, login, password);
});

apiRouter.post('/register', (req, res) => {
    const login = req.body.login as string;
    const password = req.body.password as string;
    const firstName = req.body.firstName as string;
    const lastName = req.body.lastName as string;

    utils.register(res, login, password, firstName, lastName);
});

apiRouter.use((req, res, next) => {
    if (req.method === 'OPTIONS'){
        next();
    }

    const token = req.header('X-Auth-Token');

    if (!token) {
        res.status(401).send();
    } else {
        const check = utils.checkJwt(token);

        if (check.check) {
            req.query.claims = check.claims;

            next();
        } else {
            res.sendStatus(401);
        }
    }
});

apiRouter.delete('/logout', (req, res) => {
    // добавить логику выхода из аккаунта
    const id = (req.query.claims as any).id;

    utils.logout(res, id);

    res.sendStatus(200);
});

apiRouter.get('/dialog-list-item', (req, res) => {
    const id = req.query.dialogId as string;
    const authUserId = (req.query.claims as any).id as string;

    utils.getDialogListItem(res, id, authUserId);
});

apiRouter.get('/dialog-list', (req, res) => {
    const authId = (req.query.claims as any).id as string;
    const search = (req.query.search) as string;

    utils.getDialogList(res, authId, search);
});

apiRouter.delete('/delete-empty-dialogs', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;

    utils.clearEmptyDialogs(authUserId);

    res.status(200).end();
});

apiRouter.get('/dialog', (req, res) => {
   const id = req.query.id as string;

   const authUserId = (req.query.claims as any).id as string;

   const limit = Number(req.query.limit);
   const offset = Number(req.query.offset);

   utils.getDialog(res, id, authUserId, limit, offset);
});

apiRouter.get('/dialog-messages-count', (req, res) => {
    const id = req.query.id as string;

    const authUserId = (req.query.claims as any).id as string;

    utils.getDialogMessagesCount(res, id, authUserId);
})

apiRouter.get('/user', (req, res) => {
    const id = req.query.id as string;
    const authId = (req.query.claims as any).id as string;

    utils.getUserById(res, id, authId);
});

apiRouter.get('/image', (req, res) => {
    const id = req.query.id as string;

    utils.getUserImage(res, id);
});

apiRouter.post(`/safe-image`, (req, res) => {
    const reqImage = req.body.image;

    const {type, data} = reqImage;

    const authId = (req.query.claims as any).id;

    utils.safeUserImage(res, type, data, authId);
});

apiRouter.get('/unread-messages-amount', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;
    const otherUserId = req.query.id as string;

    utils.getUnreadMessagesAmount(res, authUserId, otherUserId);
});

apiRouter.get('/user-list', (req, res) => {
    const authId = (req.query.claims as any).id as string;
    const category = req.query.category as string;

    utils.getUserList(res, authId, category);
});

apiRouter.patch('/add-friend-request', (req, res) => {
    const userId = req.body.id;
    const authUserId = (req.query.claims as any).id as string;

    if (userId) {
        pool.query(`SELECT * FROM friends WHERE first_id=? AND second_id=? OR first_id=? AND second_id=?`, [authUserId, userId, userId, authUserId]).then(result => {
            if ((result[0] as any).length == 0) {
                pool.query(`INSERT INTO friend_request VALUES (?, ?)`, [authUserId, userId]).then(result => {
                    const actionResult = {
                        actionResult: true,
                    };

                    res.json(actionResult).end();
                });
            } else {
                const actionResult = {
                    actionResult: false,

                    error: 'Пользователь уже находится у вас в друзьях',
                };

                res.json(actionResult).end();
            }
        });
    } else {
        res.json({
            actionResult: false,
            error: 'Не удалось найти пользователя',
        }).end();
    }
});

apiRouter.patch('/remove-friend-request', (req, res) => {
    const requestFrom = req.body.requestFrom, requestTo = req.body.requestTo;

    if (requestFrom && requestTo) {
        pool.query(`DELETE FROM friend_request WHERE request_from=? AND request_to=?`, [requestFrom, requestTo]).then(result => {
            if ((result[0] as any).length != 0) {
                const result =  {
                    actionResult: true,
                };

                res.json(result).end();
            } else {
                const result = {
                    actionResult: false,

                    error: 'Пользователь не находится у вас в друзьях',
                };

                res.json(result).end();
            }
        })
    } else {
        res.json({
            actionResult: false,
            error: 'Не удалось найти пользователя',
        }).end();
    }
});

apiRouter.get('/friend-request-list-to-user', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;

    pool.query(`
        SELECT
            u.first_name,
            u.last_name,
            u.id 
        FROM user u 
        WHERE u.id IN (
            SELECT request_from FROM friend_request WHERE request_to=?
        )`, authUserId)
        .then(result => {
            const userList = (result[0] as any);

            res.json({
                actionResult: true,
                result: userList
            }).end();
        })
        .catch(err => {
            console.log(err);

            res.json({
                actionResult: false,
                error: 'Ошибка сервера'
            }).end();
        });
});

apiRouter.get('/friend-request-list-from-user', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;

    pool.query(`
        SELECT
            u.first_name,
            u.last_name,
            u.id
        FROM user u 
        WHERE u.id IN (
            SELECT request_to FROM friend_request WHERE request_from=?
        )`, authUserId)
        .then(result => {
            const userList = (result[0] as any);

            res.json({
                actionResult: true,
                result: userList
            }).end();
        })
        .catch(err => {
            console.log(err);

            res.json({
                actionResult: false,
                error: 'Ошибка сервера'
            }).end();
        });
});

apiRouter.post('/delete-from-friends', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;
    const userId = req.body.userId as string;

    if (!userId) {
        res.json({
            actionResult: false,
            error: 'Не указан id пользователя'
        }).end();

        return;
    }

    pool.query(`SELECT count(*) as count FROM friends WHERE first_id=? AND second_id=? OR first_id=? AND second_id=?`, [authUserId, userId, userId, authUserId])
        .then(result => {
            if ((result[0] as any)[0].count == 0) {
                res.json({
                    actionResult: true
                }).end();
            } else {
                pool.query(`DELETE FROM friends WHERE first_id=? AND second_id=? OR first_id=? AND second_id=?`, [authUserId, userId, userId, authUserId])
                    .then(result => {
                        const affectedRows = (result[0] as any).affectedRows;

                        if (affectedRows == 2) {
                            res.json({
                                actionResult: true
                            }).end();
                        } else {
                            res.json({
                                actionResult: false,
                                error: 'Ошибка сервера'
                            }).end();
                        }
                    })
                    .catch(err => {
                        console.log(err);

                        res.json({
                            actionResult: false,
                            error: 'Ошибка сервера'
                        }).end();
                    });
            }
        })
        .catch(err => {
            console.log(err);

            res.json({
                actionResult: false,
                error: 'Ошибка сервера'
            }).end();
        });
});

apiRouter.post('/apply-friend-request', (req, res) => {
    const requestToId = req.body.requestToId as string;
    const requestFromId = req.body.requestFromId as string;

    pool.query(`DELETE FROM friend_request WHERE request_from=? AND request_to=?`, [requestFromId, requestToId])
        .then(result => {
            pool.query(`INSERT INTO friends VALUES (?, ?), (?, ?)`, [requestFromId, requestToId, requestToId, requestFromId])
                .then(result => {
                    res.json({
                        actionResult: true,
                    }).end();
                })
                .catch(err => {
                    console.log(err);

                    res.json({
                        actionResult: false,
                        error: 'Ошибка сервера'
                    }).end();
                });
        })
        .catch(err => {
            console.log(err);

            res.json({
                actionResult: false,
                error: 'Ошибка сервера'
            }).end();
        })
});

apiRouter.get('/check-community-name', (req, res) => {
    const name: string = req.query.name as string;

    if (!name.length) {
        res.json({
            actionResult: false,
            error: 'Название сообщества пусто'
        }).end();
    }

    pool.query(`SELECT COUNT(*) as count FROM community WHERE name=?`, [name]).then(result => {
        const count = (result[0] as any)[0].count;

        if (count == 0) {
            res.json({
                actionResult: true,
                result: true
            }).end();
        } else {
            res.json({
                actionResult: false,
                result: false,
                error: 'Сообщество с таким названием уже существует'
            }).end();
        }
    });
});

apiRouter.post('/create-community', (req, res) => {
    const name = req.body.name;
    const description = req.body.description;
    const image: {type: string, data: string} = req.body.image || undefined;

    if (!name?.length || !description?.length) {
        res.json({
            actionResult: false,
            error: 'Необходимо заполнить все поля'
        }).end();
    }

    pool.query(`SELECT COUNT(*) as count FROM community WHERE name=?`, [name]).then(result => {
        const count = (result[0] as any)[0].count;

        if (count != 0) {
            res.json({
                actionResult: false,
                result: false,
                error: 'Сообщество с таким названием уже существует'
            }).end();
        }

        if (image) {
            pool.query('INSERT INTO file (type, data) VALUES (?, ?)', [image.type, image.data]).then(result => {
                const result_info = result[0] as any;

                if (result_info.affectedRows) {
                    const imageId = result_info.insertId;

                    pool.query(`INSERT INTO community (name, description, community_image_id) VALUES (?, ?, ?)`, [name, description, imageId]).then(result => {
                        const result_info = result[0] as any;

                        if (result_info.affectedRows) {
                            res.json({
                                actionResult: true,
                                result: result_info.insertId
                            }).end();
                        } else {
                            res.json({
                                actionResult: false,
                                result: false,
                                error: 'Ошибка при создании сообщества'
                            }).end();
                        }
                    });
                } else {
                    res.json({
                        actionResult: false,
                        result: false,
                        error: 'Ошибка при загрузке изображения'
                    }).end();
                }
            });
        } else {
            pool.query(`INSERT INTO community (name, description) VALUES (?, ?)`, [name, description]).then(result => {
                const result_info = result[0] as any;

                if (result_info.affectedRows) {
                    res.json({
                        actionResult: true,
                        result: result_info.insertId
                    }).end();
                } else {
                    res.json({
                        actionResult: false,
                        result: false,
                        error: 'Ошибка при создании сообщества'
                    }).end();
                }
            });
        }
    });
});

apiRouter.get('/get-friends', (req, res) => {
    const id = (req.query.claims as any).id as string;

    pool.query(`SELECT second_id as id, CONCAT(first_name, ' ', last_name) as name, type, data FROM friends JOIN user u on u.id=second_id LEFT JOIN file f on f.file_id=(SELECT user_image_id FROM user WHERE id=second_id) where first_id=?`, [id]).then(result => {
        const users = (result[0] as any);

        res.json({
            actionResult: true,
            result: users
        });
    });
});

apiRouter.post('/create-room', (req, res) => {
    const name = req.body.name;
    const image: {type: string, data: string} = req.body.image || undefined;
    const member_ids: string[] = req.body.member_ids;
    const authId = (req.query.claims as any).id as string;

    if (!name.length || member_ids.length < 1) {
        res.json({
            actionResult: false,
            error: 'Необходимо заполнить название и добавить участников'
        }).end();
    }

    member_ids.push(authId);

    if (image) {
        pool.getConnection().then(conn => {
            conn.beginTransaction().then(() => {

                conn.query(`INSERT INTO file(type, data) VALUES (?, ?)`, [image.type, image.data]).then(result => {
                    const result_info = result[0] as any;

                    if (result_info.affectedRows) {

                        const imageId = result_info.insertId;

                        conn.query(`INSERT INTO room (room_name, room_image_id) VALUES (?, ?)`, [name, imageId]).then(result => {
                            const result_info = result[0] as any;

                            if (result_info.affectedRows) {

                                const roomId = result_info.insertId;
                                const members: Promise<any>[] = [];

                                member_ids.forEach(id => {
                                    members.push(conn.query(`INSERT INTO room_member (room_id, user_id) VALUES (?, ?)`, [roomId, id]));
                                });

                                Promise.all(members).then(result => {

                                    conn.commit();

                                    conn.release();

                                    res.json({
                                        actionResult: true,
                                        result: result_info.insertId
                                    }).end();
                                }).catch(err => {
                                    conn.rollback();

                                    conn.release();

                                    res.json({
                                        actionResult: false,
                                        result: false,
                                        error: 'Ошибка при создании беседы'
                                    }).end();
                                });
                            } else {
                                conn.release();

                                res.json({
                                    actionResult: false,
                                    result: false,
                                    error: 'Ошибка при создании беседы'
                                }).end();
                            }
                        }).catch((err) => {
                            conn.rollback();

                            conn.release();

                            res.json({
                                actionResult: false,
                                result: false,
                                error: 'Ошибка при создании беседы'
                            }).end();
                        });
                    } else {
                        conn.release();

                        res.json({
                            actionResult: false,
                            result: false,
                            error: 'Ошибка при загрузке изображения'
                        }).end();
                    }
                }).catch(err => {
                    conn.rollback();

                    conn.release();

                    res.json({
                        actionResult: false,
                        result: false,
                        error: 'Ошибка при создании беседы'
                    }).end();
                });
            }).catch(err => {
                conn.release();

                res.json({
                    actionResult: false,
                    result: false,
                    error: 'Ошибка при создании беседы'
                }).end();
            });
        }).catch(err => {
            res.json({
                actionResult: false,
                result: false,
                error: 'Ошибка при создании беседы'
            }).end();
        });
    } else {
        pool.getConnection().then(conn => {
            conn.beginTransaction().then(() => {
                conn.query(`INSERT INTO room (room_name) VALUES (?)`, [name]).then(result => {

                const result_info = result[0] as any;

                if (result_info.affectedRows) {

                    const roomId = result_info.insertId;
                    const members: Promise<any>[] = [];

                    member_ids.forEach(id => {
                        members.push(conn.query(`INSERT INTO room_member (room_id, user_id) VALUES (?, ?)`, [roomId, id]));
                    });

                    Promise.all(members).then(result => {

                        conn.commit();

                        conn.release();

                        res.json({
                            actionResult: true,
                            result: result_info.insertId
                        }).end();
                    }).catch(err => {
                        conn.rollback();

                        conn.release();

                        res.json({
                            actionResult: false,
                            result: false,
                            error: 'Ошибка при создании беседы'
                        }).end();
                    });
                } else {
                    conn.release();

                    res.json({
                        actionResult: false,
                        result: false,
                        error: 'Ошибка при создании беседы'
                    }).end();
                }
                }).catch((err) => {
                    conn.rollback();

                    conn.release();

                    res.json({
                        actionResult: false,
                        result: false,
                        error: 'Ошибка при создании беседы'
                    }).end();
                });
            }).catch(err => {
                conn.release();

                res.json({
                    actionResult: false,
                    result: false,
                    error: 'Ошибка при создании беседы'
                }).end();
            });
        }).catch(err => {
            res.json({
                actionResult: false,
                result: false,
                error: 'Ошибка при создании беседы'
            }).end();
        });
    }
});

apiRouter.get('/get-room', (req, res) => {
    const roomId: string = req.query.id as string;
    const authUserId = (req.query.claims as any).id as string;

    pool.getConnection()
        .then(conn => {
            conn.beginTransaction()
                .then(() => {
                    conn.query(`
                        SELECT 
                            r.room_name, 
                            r.room_id,
                            (SELECT message_text FROM message WHERE room_id=r.room_id ORDER BY timestamp DESC LIMIT 1) as last_message,
                            (SELECT count(*) FROM unread_message_by WHERE unread_by=? AND room_id=?) as unread_message_amount
                        FROM room r WHERE room_id=?`, [authUserId, roomId, roomId])
                        .then(result => {
                            const room = (result[0] as any)[0];

                            if (room) {
                                res.json({
                                    actionResult: true,
                                    result: room
                                });
                            } else {
                                res.json({
                                    actionResult: false,
                                    error: 'Ошибка при получении беседы'
                                });
                            }

                            res.end();
                        })
                        .catch(err => {
                            conn.rollback();

                            conn.release();

                            res.json({
                                actionResult: false,
                                error: 'Ошибка сервера'
                            }).end();
                        });
                })
                .catch(err => {
                    conn.release();

                    res.json({
                        actionResult: false,
                        error: 'Ошибка при загрузке беседы'
                    }).end();
                })
        })
        .catch(err => {
            res.json({
                actionResult: false,
                error: 'Ошибка при загрузке беседы'
            }).end();
        });
});

apiRouter.get('/room-image', (req, res) => {
    const roomId = req.query.roomId;

    pool.query(`SELECT type, data FROM room JOIN file ON room_image_id=file_id WHERE room_id=?`, [roomId])
        .then(result => {
            const r = (result[0] as any)[0];

            if (r) {
                res.json({
                    actionResult: true,
                    result: r
                }).end();
            } else {
                res.json({
                    actionResult: false
                }).end();
            }
        })
});

apiRouter.get('/current-room-info', (req, res) => {
    const roomId = (req.query.roomId);

    if (!roomId) {
        res.json({
            actionResult: false,
            error: 'Не указан id беседы'
        }).end();

        return;
    } else {
        pool.query(`
            SELECT 
                r.room_name,
                r.room_id,
                f.type,
                f.data,
                (SELECT COUNT(*) FROM room_member WHERE room_id=?) as room_members_count
            FROM room r 
            LEFT JOIN file f 
            ON f.file_id=r.room_image_id 
            WHERE r.room_id=?`, [roomId, roomId])
            .then(result => {
                const room = (result[0] as any)[0];

                if (!room) {
                    res.json({
                        actionResult: false,
                        error: 'Беседы не существует'
                    }).end();
                } else {
                    const resultRoom = {
                        room_name: room.room_name,
                        room_id: room.room_id,
                        room_members_count: room.room_members_count,
                        image: {
                            type: room.type,
                            data: room.data,
                        }
                    };

                    res.json({
                        actionResult: true,
                        result: resultRoom
                    }).end();
                }
            })
            .catch(err => {
                console.log(err);

                res.json({
                    actionResult: false,
                    error: 'Ошибка сервера'
                }).end();
            })
    }
});

apiRouter.get('/room-messages', (req, res) => {
    const roomId = req.query.roomId as string;
    const authUserId = (req.query.claims as any).id as string;

    const limit = Number(req.query.limit);
    const offset = Number(req.query.offset);


    if (!roomId) {
        res.json({
            actionResult: false,
            error: 'Не указан id беседы',
        }).end();

        return;
    }

    pool.query(`
    SELECT 
        m.message_text,
        m.timestamp,
        m.room_id,
        m.send_from_id,
        m.id,
        IF(
            m.send_from_id=?,
            m.is_read,
            IF((
                SELECT
                count(*)
                FROM unread_message_by u
                WHERE u.message_id=m.id AND u.room_id=m.room_id AND unread_by=?
            ) > 0, FALSE, TRUE) 
        )
        as is_read
    FROM message m
    WHERE m.room_id=?
    ORDER BY m.timestamp
    LIMIT ? OFFSET ?`, [authUserId, authUserId, roomId, limit, offset])
        .then(result => {
            const messages = (result[0] as any);

            let isEnd: boolean = false;

            if (offset == 0) {
                isEnd = true;
            }

            pool.query(`SELECT count(*) as total_count FROM message WHERE room_id=?`,[roomId])
                .then(total_count_res => {
                    const total_count = (total_count_res[0] as any)[0].total_count;

                    res.json({
                        actionResult: true,
                        result: messages,
                        isEnd,
                        total_count
                    }).end();
                })
                .catch(err => {
                    res.json({
                        actionResult: false,
                        error: 'Ошибка сервера',
                    }).end();
                });
        })
        .catch(err => {
            res.json({
                actionResult: false,
                error: 'Ошибка сервера',
            }).end();
        })
});

apiRouter.get('/room-members', (req, res) => {
    const roomId = req.query.roomId as string;

    if (!roomId) {
        res.json({
            actionResult: false,
            error: 'Не указан id беседы',
        }).end();

        return;
    }

    pool.query(`
        SELECT 
            u.id,
            u.first_name, 
            u.last_name,
            f.type,
            f.data 
        FROM room_member r
        JOIN user u ON r.user_id=u.id 
        LEFT JOIN file f ON u.user_image_id=f.file_id
        WHERE r.room_id=?
        `, [roomId])
    .then(result => {
        const userList = result[0];

        if (userList) {
            res.json({
                actionResult: true,
                result: userList
            }).end();
        } else {
            res.json({
                actionResult: false,
                error: 'Участников не найдено',
            }).end();
        }
    })
    .catch(err => {
        res.json({
            actionResult: false,
            error: 'Ошибка сервера',
        }).end();
    });
});

apiRouter.get('/room-messages-count', (req, res) => {
    const roomId = req.query.roomId;
    const authUserId = (req.query.claims as any).id as string;

    if (!roomId) {
        res.json({
            actionResult: false,
            error: 'Не указан id беседы',
        }).end();

        return;
    }

    pool.query(`
        SELECT 
            COUNT(*) as room_messages_count,
            (SELECT count(*) 
        FROM unread_message_by 
        WHERE room_id=? AND unread_by=?) as unread_messages_count FROM message WHERE room_id=?`, [roomId, authUserId, roomId])
        .then(result => {
            if ((result[0] as any)[0]) {
                const roomMessages = (result[0] as any)[0];

                res.json({
                    actionResult: true,
                    result: {
                        messagesCount: roomMessages.room_messages_count,
                        unreadMessagesCount: roomMessages.unread_messages_count
                    },
                }).end();

                return;
            }

            res.json({
                actionResult: false,
                error: 'Неверный id беседы',
            }).end();
        })
        .catch(err => {
            res.json({
                actionResult: false,
                error: 'Ошибка сервера',
            }).end();
        })
});

server.use('/api', apiRouter);

server.listen(3000, () => {
    console.log('SERVER START');
})