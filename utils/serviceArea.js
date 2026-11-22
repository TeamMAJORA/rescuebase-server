// Locations must be near the shelter's service area: a radius around Cebu City.
// Change these two values to move or resize the area.
const SERVICE_AREA_CENTER = { latitude: 10.3157, longitude: 123.8854 };
const SERVICE_AREA_RADIUS_KM = 30;

function distanceInKm(fromLatitude, fromLongitude, toLatitude, toLongitude) {
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const latitudeDifference = toRadians(toLatitude - fromLatitude);
    const longitudeDifference = toRadians(toLongitude - fromLongitude);
    const a =
        Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(toRadians(fromLatitude)) * Math.cos(toRadians(toLatitude)) *
        Math.sin(longitudeDifference / 2) ** 2;

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function assertWithinServiceArea(latitude, longitude) {
    const distance = distanceInKm(
        SERVICE_AREA_CENTER.latitude,
        SERVICE_AREA_CENTER.longitude,
        latitude,
        longitude
    );

    if (distance > SERVICE_AREA_RADIUS_KM) {
        const error = new Error(`Location must be within ${SERVICE_AREA_RADIUS_KM} km of Cebu City.`);
        error.statusCode = 400;
        throw error;
    }
}

module.exports = { SERVICE_AREA_CENTER, SERVICE_AREA_RADIUS_KM, assertWithinServiceArea };
