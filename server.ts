import express from 'express';
import * as utils from './utils';

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

    utils.getDialogList(res, authId);
});

apiRouter.delete('/delete-empty-dialogs', (req, res) => {
    const authUserId = (req.query.claims as any).id as string;

    utils.clearEmptyDialogs(authUserId);
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

apiRouter.patch('/add-friend', (req, res) => {
    const userId = req.body.id;
    const authUserId = (req.query.claims as any).id as string;

    if (userId) {
         utils.addToFriend(res, authUserId, userId);
    } else {
        res.json({
            actionResult: false,
            error: 'Не удалось найти пользователя',
        }).end();
    }
});

apiRouter.patch('/remove-friend', (req, res) => {
    const userId = req.body.id;
    const authUserId = (req.query.claims as any).id as string;

    if (userId) {
        utils.removeFromFriend(res, authUserId, userId);
    } else {
        res.json({
            actionResult: false,
            error: 'Не удалось найти пользователя',
        }).end();
    }
});

server.use('/api', apiRouter);

server.listen(3000, () => {
    console.log('SERVER START');
})