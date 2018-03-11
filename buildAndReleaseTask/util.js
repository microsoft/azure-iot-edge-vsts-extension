class Util {
  static expandEnv(input, ...exceptKeys) {
    const pattern = new RegExp(/\$([a-zA-Z0-9_]+)|\${([a-zA-Z0-9_]+)}/g);
    const exceptSet = new Set(exceptKeys);
    return input.replace(pattern, (matched) => {
      if (exceptKeys && exceptSet.has(matched)) {
        return matched;
      }
      const key = matched.replace(/\$|{|}/g, "");
      return process.env[key] || matched;
    });
  }
}

module.exports = Util;