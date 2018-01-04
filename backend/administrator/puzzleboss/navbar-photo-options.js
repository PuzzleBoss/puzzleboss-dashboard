module.exports = {
  render: renderNavigation
}

async function renderNavigation (req, doc) {
  const template = doc.getElementById('navbar-template')
  doc.renderTemplate(req.query, 'navbar-html-template', template)
}
