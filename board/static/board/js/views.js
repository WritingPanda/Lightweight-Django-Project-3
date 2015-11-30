(function ($, Backbone, _, app) {

    var TemplateView = Backbone.View.extend({
        templateName: '',
        initialize: function () {
            this.template = _.template($(this.templateName).html());
        },
        render: function () {
            var context = this.getContext(),
                html = this.template(context);
            this.$el.html(html);
        },
        getContext: function () {
            return {};
        }
    });

    var FormView = TemplateView.extend({
        events: {
            'submit form': 'submit'
        },
        errorTemplate: _.template('<span class="error"><%- msg %></span>'),
        clearErrors: function () {
            $('.error', this.form).remove();
        },
        showErrors: function (errors) {
            _.map(errors, function (fieldErrors, name) {
                var field = $(':input[name=' + name + ']', this.form),
                    label = $('label[for=' + field.attr('id') + ']', this.form);
                if (label.length === 0) {
                    label = $('label', this.form).first();
                }
                function appendError(msg) {
                    label.before(this.errorTemplate({msg: msg}));
                }
                _.map(fieldErrors, appendError, this);
            }, this);
        },
        serializeForm: function (form) {
            return _.object(_.map(form.serializeArray(), function (item) {
                // Convert object to tuple of (name, value)
                return [item.name, item.value];
            }));
        },
        submit: function (event) {
            event.preventDefault();
            this.form = $(event.currentTarget);
            this.clearErrors();
        },
        failure: function (xhr, status, error) {
            var errors = xhr.responseJSON;
            this.showErrors(errors);
        },
        done: function (event) {
            if (event) {
                event.preventDefault();
            }
            this.trigger('done');
            this.remove();
        },
        modelFailure: function (model, xhr, options) {
            var errors = xhr.responseJSON;
            this.showErrors(errors);
        }
    });

    var NewSprintView = FormView.extend({
        templateName: '#new-sprint-template',
        className: 'new-sprint',
        /*
         * Clicking the add button will trigger the form submit , which is handled by the
         * FormView base. In addition to the default submit event handler, the view will
         * also handle a cancel button to call the done method defined by the FormView. (139)
         */
        events: _.extend({
            'click button.cancel': 'done'
        }, FormView.prototype.events),
        submit: function (event) {
            var self = this,
                attributes = {};
            FormView.prototype.submit.apply(this, arguments);
            attributes = this.serializeForm(this.form);
            app.collections.ready.done(function () {
                app.sprints.create(attributes, {
                    wait: true,
                    success: $.proxy(self.success, self),
                    error: $.proxy(self.modelFailure, self)
                });
            });
        },
        success: function (model) {
            this.done();
            window.location.hash = '#sprint/' + model.get('id');
        }
    });

    var HomepageView = TemplateView.extend({
        templateName: '#home-template',
        events: {
            'click button.add': 'renderAddForm'
        },
        /*
         * When the view is created, sprints that have an end date greater than seven days
         * ago are fetched. When the sprints are available, the view is rendered again to
         * display them. (136)
         */
        initialize: function (options) {
            /*
             * For those more familiar with Python than JavaScript, the use of var self = this; in
             * the initialize function saves a reference for the current value of `this`, which will be
             * the instance of the view, so that it can be used later in the done callback function. The
             * value of this is determined by how the function/method is called, and ensuring that it
             * is correct can be tricky—particularly with nested callback functions. Another pattern
             * you’ll see throughout this book is $.proxy , which can be used to explicitly set the context
             * of this for the function call. Underscore has an equivalent helper named _.bind . Both
             * of these emulate the Function.prototype.bind introduced in ECMAScript 5 and en‐
             * sure cross-browser compatibility. (137)
             */
            var self = this;
            TemplateView.prototype.initialize.apply(this, arguments);
            app.collections.ready.done(function () {
                var end = new Date();
                end.setDate(end.getDate() - 7);
                end = end.toISOString().replace(/ T.*/g, '');
                app.sprints.fetch({
                    data: {end_min: end},
                    success: $.proxy(self.render, self)
                });
            });
        },
        getContext: function () {
            return {sprints: app.sprints || null};
        },
        /*
         * The click event for the add button is now handled by a renderAddForm. This
         * creates a NewSprintView instance, which is rendered just above the button.
         * When the view is done, either from the add or the cancel button, the link is
         * shown again.
         */
        renderAddForm: function (event) {
            var view = new NewSprintView(),
                link = $(event.currentTarget);
            event.preventDefault();
            link.before(view.el);
            link.hide();
            view.render();
            view.on('done', function () {
                link.show();
            });
        }
    });

    var LoginView = FormView.extend({
        id: 'login',
        templateName: '#login-template',
        submit: function (event) {
            var data = {};
            // JavaScript doesn’t have a super call like Python.
            // FormView.prototype.submit.apply is the effective equivalent to call
            // the parent method (120).
            FormView.prototype.submit.apply(this, arguments);
            data = this.serializeForm(this.form);
            $.post(app.apiLogin, data)
                .done($.proxy(this.loginSuccess, this))
                .fail($.proxy(this.failure, this));
        },
        loginSuccess: function (data) {
            app.session.save(data.token);
            this.done();
        }
    });

    var HeaderView = TemplateView.extend({
        // Unlike previous views, the tagName is defined. This means the template renders
        // into a <header> element (122).
        tagName: 'header',
        templateName: '#header-template',
        events: {
            'click a.logout': 'logout'
        },
        getContext: function () {
            return {authenticated: app.session.authenticated()};
        },
        logout: function (event) {
            event.preventDefault();
            app.session.delete();
            window.location = '/';
        }
    });

    var StatusView = TemplateView.extend({
        tagName: 'section',
        className: 'status',
        templateName: '#status-template',
        initialize: function (options) {
            TemplateView.prototype.initialize.apply(this, arguments);
            this.sprint = options.sprint;
            this.status = options.status;
            this.title = options.title;
        },
        getContext: function () {
            return {sprint: this.sprint, title: this.title};
        }
    });

    var SprintView = TemplateView.extend({
        templateName: '#sprint-template',
        initialize: function (options) {
            var self = this;
            TemplateView.prototype.initialize.apply(this, arguments);
            /*
             * app.sprints.push will put a new model instance into the client-site collection.
             * This model will know only the id of the model. The subsequent fetch will
             * retrieve the remaining details from the API (142).
             */
            this.sprintId = options.sprintId;
            this.sprint = null;
            this.statuses = {
                unassigned: new StatusView({
                    sprint: null, status: 1, title: 'Backlog'
                }),
                todo: new StatusView({
                    sprint: this.sprintId, status: 1, title: 'Not Started'
                }),
                active: new StatusView({
                    sprint: this.sprintId, status: 2, title: 'In Development'
                }),
                testing: new StatusView({
                    sprint: this.sprintId, status: 3, title: 'In Testing'
                }),
                done: new StatusView({
                    sprint: this.sprintId, status: 4, title: 'Completed'
                })
            };
            app.collections.ready.done(function () {
                app.sprints.getOrFetch(self.sprintId).done(function (sprint) {
                    self.sprint = sprint;
                    self.render();
                }).fail(function (sprint) {
                    self.sprint = sprint;
                    self.sprint.invalid = true;
                    self.render();
                });
            });
        },
        getContext: function () {
            return {sprint: this.sprint};
        },
        render: function () {
            TemplateView.prototype.render.apply(this, arguments);
            _.each(this.statuses, function (view, name) {
                $('.tasks', this.$el).append(view.el);
                view.delegateEvents();
                view.render();
            }, this);
        }
    });

    app.views.HomepageView = HomepageView;
    app.views.LoginView = LoginView;
    app.views.HeaderView = HeaderView;
    app.views.SprintView = SprintView;

})(jQuery, Backbone, _, app);

// TODO: work on page 141 of the Lightweight Django Book. Sprint Detail Page