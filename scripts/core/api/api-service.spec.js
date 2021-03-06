function collection(data) {
    return {_items: data};
}

var USER_URL = 'http://localhost/users/1',
    USER_PATH = '/users/1',
    USERS_URL = 'http://localhost/users',
    SERVER_URL = 'http://localhost',
    ETAG = 'xyz';

function testEtagHeader(headers) {
    return headers['If-Match'] === ETAG;
}

var HTTP_API = {
    type: 'http',
    service: function() {
        this.queryLog = [];

        var query = this.query;

        this.query = function(criteria) {
            this.queryLog.push(criteria);
            return query.call(this, criteria);
        };

        this.ping = function() {
            return 'pong';
        };
    },
    backend: {
        rel: 'users',
        headers: {'X-Filter': 'User.*'},
    },
};

function doConfig($provide) {
    $provide.constant('config', {server: {url: SERVER_URL}});
}

describe('API Provider', () => {
    beforeEach(window.module(doConfig));
    beforeEach(window.module('superdesk.core.api'));

    beforeEach(() => {
        angular.module('superdesk.core.api')
            .config(['apiProvider', (apiProvider) => {
                apiProvider.api('http', HTTP_API);
            }]);
    });

    it('exists', inject((api) => {
        expect(api).toBeDefined();
    }));

    it('can register apis', inject((api) => {
        expect(api.http).toBeDefined();
    }));

    it('can override backend methods', inject((api, $rootScope) => {
        expect(api.http.queryLog.length).toBe(0);
        api.http.query();
        expect(api.http.queryLog.length).toBe(1);
    }));

    it('can define new methods', inject((api) => {
        expect(api.http.ping()).toBe('pong');
    }));

    describe('HTTP API Endpoint', () => {
        afterEach(inject(($httpBackend) => {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        }));

        it('can query', inject((api, urls, $q, $httpBackend, $http) => {
            var headers = $http.defaults.headers.common;

            headers['X-Filter'] = 'User.*';

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            $httpBackend.expectGET(USERS_URL, headers).respond(collection([{}]));

            var users;

            api.http.query().then((_users) => {
                users = _users;
            });

            $httpBackend.flush();

            expect(users._items.length).toBe(1);
            expect(urls.resource).toHaveBeenCalledWith('users');
        }));

        it('rejects on query error', inject((api, urls, $q, $httpBackend) => {
            $httpBackend.expectGET(USERS_URL).respond(400);

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            var reject;

            api.http.query().then(null, (reason) => {
                reject = true;
            });

            $httpBackend.flush();

            expect(reject).toBe(true);
        }));

        it('can create new resource', inject((api, urls, $q, $httpBackend) => {
            var userData = {username: 'test'},
                user;

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            $httpBackend.expectPOST(USERS_URL, userData).respond(201, {_links: {self: {href: 'user_href'}}});

            api.http.save({username: 'test'}).then((_user) => {
                user = _user;
            });

            $httpBackend.flush();

            expect(user._links.self.href).toBe('user_href');
            expect(urls.resource).toHaveBeenCalledWith('users');
        }));

        it('can fail creating new resource', inject((api, urls, $q, $httpBackend) => {
            var userData = {username: 'test'};

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            $httpBackend.expectPOST(USERS_URL, userData).respond(200, {
                _status: 'ERR',
                _issues: {first_name: {required: 1}},
            });

            var test = null;

            api.http.save({username: 'test'}).then((response) => {
                test = true;
            }, (response) => {
                test = false;
            });

            $httpBackend.flush();

            expect(test).toBe(false);
        }));

        it('can create new with diff', inject((api, urls, $q, $httpBackend) => {
            var user = {},
                data = {username: 'test'};

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            $httpBackend.expectPOST(USERS_URL, data).respond(201, {_links: {self: {href: 'user_href'}}});

            api.http.save(user, data);

            $httpBackend.flush();

            expect(user.username).toBe('test');
            expect(urls.resource).toHaveBeenCalledWith('users');
        }));

        it('can update', inject((api, $httpBackend) => {
            var user;
            var userData = {
                _links: {self: {href: USER_PATH}},
                _id: 2,
                username: 'test',
                Avatar: {href: 'test'},
            };

            $httpBackend.expectPATCH(USER_URL, {username: 'test', Avatar: {href: 'test'}}).respond(200);

            api.http.save(userData).then((_user) => {
                user = _user;
            });

            $httpBackend.flush();

            expect(user.username).toBe('test');
            expect(user._links.self.href).toBe(USER_PATH);
        }));

        it('can update with diff', inject((api, $httpBackend) => {
            var userData = {_links: {self: {href: USER_PATH}}, _id: 2, username: 'test'},
                diff = {Active: false};

            $httpBackend.expectPATCH(USER_URL, diff).respond({});

            api.http.save(userData, diff);

            $httpBackend.flush();
        }));

        it('can delete', inject((api, $httpBackend) => {
            var user = {_links: {self: {href: USER_PATH}}},
                then = jasmine.createSpy('then');

            $httpBackend.expectDELETE(USER_URL).respond(204);

            api.http.remove(user).then(then);

            $httpBackend.flush();

            expect(then).toHaveBeenCalled();
        }));

        it('handles delete on deleted resource as success', inject((api, $httpBackend) => {
            var user = {_links: {self: {href: USER_PATH}}},
                then = jasmine.createSpy('then');

            $httpBackend.expectDELETE(USER_URL).respond(404);

            api.http.remove(user).then(then);

            $httpBackend.flush();

            expect(then).toHaveBeenCalled();
        }));

        it('rejects other delete errors as errors', inject((api, $httpBackend) => {
            var user = {_links: {self: {href: USER_PATH}}},
                success = jasmine.createSpy('success'),
                error = jasmine.createSpy('error');

            $httpBackend.expectDELETE(USER_URL).respond(405);

            api.http.remove(user).then(success, error);

            $httpBackend.flush();

            expect(success).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        }));

        it('can get item by url', inject((api, $httpBackend) => {
            var user;

            $httpBackend.expectGET(USER_URL).respond({username: 'foo'});

            api.http.getByUrl(USER_PATH).then((_user) => {
                user = _user;
            });

            $httpBackend.flush();

            expect(user.username).toBe('foo');
        }));

        it('can get item by id', inject((api, urls, $q, $httpBackend) => {
            var user;

            spyOn(urls, 'resource').and.returnValue($q.when(SERVER_URL + '/users'));

            $httpBackend.expectGET(SERVER_URL + '/users/1').respond({username: 'foo'});

            api.http.getById(1).then((_user) => {
                user = _user;
            });

            $httpBackend.flush();

            expect(user.username).toBe('foo');
            expect(urls.resource).toHaveBeenCalledWith('users');
        }));

        it('can replace resource on given dest', inject((api, $httpBackend) => {
            var data = {username: 'foo'};

            $httpBackend.expectPUT(USER_URL, data).respond({});

            api.http.replace(USER_PATH, data);

            $httpBackend.flush();
        }));

        it('rejects non success responses', inject((api, $httpBackend) => {
            $httpBackend.expectGET(USER_URL).respond(400);

            var success = jasmine.createSpy('success'),
                error = jasmine.createSpy('error');

            api.http.getByUrl(USER_PATH).then(success, error);

            $httpBackend.flush();

            expect(success).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        }));

        it('can get resource url', inject((api, urls, $q, $rootScope) => {
            var url;

            spyOn(urls, 'resource').and.returnValue($q.when(USERS_URL));

            api.http.getUrl().then((_url) => {
                url = _url;
            });

            $rootScope.$digest();

            expect(url).toBe(USERS_URL);
            expect(urls.resource).toHaveBeenCalledWith('users');
        }));

        it('can get resource headers', inject((api) => {
            expect(api.http.getHeaders()['X-Filter']).toBe('User.*');
        }));
    });

    describe('new api service', () => {
        afterEach(inject(($httpBackend) => {
            $httpBackend.verifyNoOutstandingExpectation();
            $httpBackend.verifyNoOutstandingRequest();
        }));

        beforeEach(inject(($httpBackend) => {
            $httpBackend.whenGET(SERVER_URL).respond(200, {
                _links: {child: [
                    {title: 'users', href: '/users'},
                    {title: 'workspace', href: '/users/<regex():user_id>/workspace'},
                ]},
            });
        }));

        it('can create', inject((api, $httpBackend) => {
            var user = {name: 'foo'};

            $httpBackend.expectPOST(USERS_URL, user).respond(201, {_id: 1});

            api('users').save(user);

            $httpBackend.flush();

            expect(user._id).toBe(1);
        }));

        it('can update', inject((api, $httpBackend) => {
            var user = {_id: 1, _links: {self: {href: USER_PATH}}, name: 'foo', _etag: ETAG};
            var diff = {name: 'bar'};

            $httpBackend.expectPATCH(USER_URL, diff, testEtagHeader).respond(200, {name: 'bar', _type: 'user'});

            api('users').save(user, diff);

            $httpBackend.flush();

            expect(user.name).toBe('bar');
            expect(_.has(user, '_type')).toBe(false);

            $httpBackend.expectPATCH(USER_URL, {foo: 1}, testEtagHeader).respond(200, {});
            api('users').save(user, {foo: 1, _type: 'user'});
            $httpBackend.flush();
            $httpBackend.verifyNoOutstandingExpectation();
        }));

        it('can query resource', inject((api, $httpBackend) => {
            $httpBackend.expectGET(USERS_URL + '?limit=1').respond(200, {_items: []});

            var users;

            api('users').query({limit: 1})
                .then((_users) => {
                    users = _users;
                });

            $httpBackend.flush();

            expect(users._items.length).toBe(0);
        }));

        it('can query subresource', inject((api, $httpBackend) => {
            var user = {_id: 1};

            $httpBackend.expectGET(USER_URL + '/workspace').respond(200, {});

            api('workspace', user).query();

            $httpBackend.flush();
        }));

        it('rejects on status error', inject((api, $httpBackend) => {
            $httpBackend.expectGET(USERS_URL).respond(400);

            var success = jasmine.createSpy('success'),
                error = jasmine.createSpy('error');

            api('users').query()
                .then(success, error);

            $httpBackend.flush();

            expect(success).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        }));

        it('rejects on data error', inject((api, $httpBackend) => {
            $httpBackend.expectPOST(USERS_URL).respond(200, {_status: 'ERR'});

            var success = jasmine.createSpy('success'),
                error = jasmine.createSpy('error');

            api('users')
                .save({})
                .then(success, error);

            $httpBackend.flush();

            expect(success).not.toHaveBeenCalled();
            expect(error).toHaveBeenCalled();
        }));

        it('cleans data before saving it', inject((api, $httpBackend) => {
            $httpBackend.expectPOST(USERS_URL, {name: 'foo', _id: 1}).respond(200, {});
            api('users').save({name: 'foo', _created: 'now', _updated: 'now', _id: 1});
            $httpBackend.flush();
        }));

        it('can fetch an item by id', inject((api, $httpBackend) => {
            var data = {_id: 1}, user;

            $httpBackend.expectGET(USER_URL).respond(200, data);
            api('users').getById(1)
                .then((_user) => {
                    user = _user;
                });
            $httpBackend.flush();
            expect(user._id).toBe(1);
        }));

        it('can remove an item', inject((api, $httpBackend) => {
            var user = {_links: {self: {href: USER_PATH}}, _etag: ETAG};

            $httpBackend.expectDELETE(USER_URL, testEtagHeader).respond(200);
            api('users').remove(user);
            $httpBackend.flush();
        }));

        it('can get a given url', inject((api, $httpBackend) => {
            $httpBackend.expectGET(USER_URL).respond(200, {});
            api.get(USER_PATH);
            $httpBackend.flush();
        }));

        it('can update given resource', inject((api, $httpBackend) => {
            var data = {name: 'foo'};

            $httpBackend.expectPATCH(USER_URL, data).respond(200);
            api.update('users', {_id: 1}, data);
            $httpBackend.flush();
        }));

        it('can clean diff data for update', inject((api, $httpBackend) => {
            var user = {_links: {self: {href: USER_PATH}}, username: 'foo'};
            var diff = Object.create(user);

            diff.last_name = false;

            $httpBackend.expectPATCH(USER_URL, {last_name: false}).respond(200, {});
            api.save('users', user, diff);
            $httpBackend.flush();
        }));
    });
});
