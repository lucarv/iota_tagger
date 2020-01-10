const getSwedishDate = () => {
    //let t = new Date(new Date().setDate(new Date().getDate()-1));
    let t = new Date();
    t.setDate(t.getDate() - 1);
    let y = t.getFullYear().toString();
    let m = (t.getMonth() + 1).toString();

    if (m.length == 1)
        m = '0' + m;

    let d = t.getDate().toString();
    if (d.length == 1) d = '0' + d;
    t = y + '-' + m + '-' + d;

    return t
}

module.exports.getSwedishDate = getSwedishDate;