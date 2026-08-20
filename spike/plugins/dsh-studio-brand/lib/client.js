/**
 * DSH Studio brand surface, browser half. Hand-authored in the lazy-CJS
 * ModuleLoader format for the spike (no tsdown yet): the bundle only
 * REGISTERS its factory; all side effects live inside the factory and run at
 * materialization. Externals resolve through the injected require — only
 * platform-module specifiers are legal (react et al.).
 *
 * The logo is the finalized brand icon (assets/brand/icon-1024.png) inlined
 * at 64px — no emoji, per the brand rule.
 */
window.__ModuleLoader__.load({
  id: 'dsh-studio-brand',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require('react');

    var LOGO = 'data:image/png;base64,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';

    /** Sidebar footer badge — the visible proof that ui-slots accepted us.
        Owner passes { wide }: a collapsed sidebar renders the logo alone. */
    function StudioBrandBadge(props) {
      var wide = !props || props.wide !== false;
      return React.createElement(
        'div',
        {
          'data-testid': 'dsh-studio-brand',
          title: 'DSH Studio',
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: wide ? 'flex-start' : 'center',
            gap: '8px',
            padding: wide ? '5px 10px' : '5px 0',
            fontSize: '12.5px',
            lineHeight: '16px',
            fontWeight: 500,
            borderRadius: '8px',
            userSelect: 'none',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          },
        },
        React.createElement('img', {
          src: LOGO,
          alt: '',
          width: 18,
          height: 18,
          style: { borderRadius: '5px', display: 'block', flex: 'none' },
        }),
        wide
          ? React.createElement(
              'span',
              { style: { overflow: 'hidden', textOverflow: 'ellipsis' } },
              'DSH Studio',
            )
          : null,
      );
    }

    /** Required services: the slot registry only. */
    var inject = ['slots'];

    /** Mount the badge into the sidebar footer action list. */
    function apply(ctx) {
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register(
          {
            name: 'sidebar.footer.action',
            id: 'dsh-studio-brand',
          },
          StudioBrandBadge,
        ),
      );
    }

    exports.inject = inject;
    exports.apply = apply;
    return module.exports;
  },
});
