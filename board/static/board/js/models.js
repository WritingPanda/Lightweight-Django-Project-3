(function ($, Backbone, _, app) {

    // CSRF helper functions taken directly from Django docs
    // https://docs.djangoproject.com/en/1.8/ref/csrf/
    function csrfSafeMethod(method) {
        // these HTTP methods do not require CSRF protection
        return (/^(GET|HEAD|OPTIONS|TRACE)$/i.test(method));
    }

    function getCookie(name) {
        var cookieValue = null;
        if (document.cookie && document.cookie != '') {
            var cookies = document.cookie.split(';');
            for (var i = 0; i < cookies.length; i++) {
                var cookie = $.trim(cookies[i]);
                // Does this cookie string begin with the name we want?
                if (cookie.substring(0, name.length + 1) == (name + '=')) {
                    cookieValue = decodeURIComponent(
                        cookie.substring(name.length + 1)
                    );
                    break;
                }
            }
        }
        return cookieValue;
    }

    // Setup jQuery ajax calls to handle CSRF
    $.ajaxPrefilter(function (settings, originalOptions, xhr) {
        var csrftoken;
        if (!csrfSafeMethod(settings.type) && !this.crossDomain) {
            /*
                Send the token to same-origin, relative URLs only.
                Send the token only if the method warrants CSRF protection
                Using the CSRFToken value acquired earlier
             */
            csrftoken = getCookie('csrftoken');
            xhr.setRequestHeader('X-CSRFToken', csrftoken);
        }
    });

    var Session = Backbone.Model.extend({
        defaults: {
            token: null
        },
        initialize: function (options) {
            this.options = options;
            $.ajaxPrefilter($.proxy(this._setupAuth, this));
            this.load();
        },
        load: function () {
            var token = localStorage.apiToken;
            if (token) {
                this.set('token', token);
            }
        },
        save: function (token) {
            this.set('token', token);
            if (token === null) {
                localStorage.removeItem('apiToken');
            } else {
                localStorage.apiToken = token;
            }
        },
        delete: function () {
            this.save(null);
        },
        authenticated: function () {
            return this.get('token') !== null;
        },
        _setupAuth: function (settings, originalOptions, xhr) {
            if (this.authenticated()) {
                xhr.setRequestHeader(
                    'Authorization',
                    'Token ' + this.get('token')
                );
            }
        }
    });

    app.session = new Session();

    // This code overrides the default URL construction and starts by looking for the
    // self value from the links attribute (133).
    var BaseModel = Backbone.Model.extend({
        url: function () {
            var links = this.get('links'),
                url = links && links.self;
            if (!url) {
                // If the URL wasn’t given by the API, it is constructed
                // using the original Backbone method.
                url = Backbone.Model.prototype.url.call(this);
            }
            return url;
        }
    });

    app.models.Sprint = BaseModel.extend({});
    app.models.Task = BaseModel.extend({});
    app.models.User = BaseModel.extend({
        idAttributemodel: 'username'
    });
    /*
     *  The pagination implemented by the API wraps the list of objects with metadata
     *   about the pages and total counts. To get this to work with Backbone, we need
     *   to change the parse method on each collection.
     *********************************************************************************
     *   This is a minimal approach to handling the API pagination. For a
     *   more comprehensive approach, take a look at backbone-paginator.
     *   https://github.com/backbone-paginator/backbone.paginator
     */
    var BaseCollection = Backbone.Collection.extend({
        parse: function (response) {
            this._next = response.next;
            this._previous = response.previous;
            this._count = response.count;
            return response.results || [];
        }
    });

    app.collections.ready = $.getJSON(app.apiRoot);
    app.collections.ready.done(function (data) {
        app.collections.Sprints = BaseCollection.extend({
            model: app.models.Sprint,
            url: data.sprints
        });
        app.sprints = new app.collections.Sprints();
        app.collections.Tasks = BaseCollection.extend({
            model: app.models.Task,
            url: data.tasks
        });
        app.tasks = new app.collections.Tasks();
        app.collections.Users = BaseCollection.extend({
            model: app.models.User,
            url: data.users
        });
        app.users = new app.collections.Users();
    });

})(jQuery, Backbone, _, app);