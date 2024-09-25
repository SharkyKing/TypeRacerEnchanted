// Player model
module.exports = (sequelize, DataTypes) => {
  const Player = sequelize.define("Player", {
    currentWordIndex: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
    },
    socketID: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    isPartyLeader: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    WPM: {
      type: DataTypes.INTEGER,
      defaultValue: -1,
    },
    nickName: {
      type: DataTypes.STRING,
      allowNull: false,
    }
  });

  Player.associate = (models) => {
    Player.belongsTo(models.Game, {
      foreignKey: 'gameId',
      as: 'game',
    });
  };

  return Player;
};
